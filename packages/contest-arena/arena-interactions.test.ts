import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('./frontend/arena.js', import.meta.url), 'utf8');
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
function harness(permission = 'granted', stored = new Map<string, string>(), requestedPermission = permission) {
    let now = 10000000;
    const start = now - 60000; const end = now + 120000;
    const events: Record<string, ((event?: any) => any)[]> = {};
    const intervals: { callback: () => void, delay: number }[] = [];
    const requests: string[] = []; const messages: any[] = [];
    const element = () => ({ textContent: '', hidden: false, disabled: false, href: '', style: {},
        classList: { toggle: () => {} }, setAttribute: () => {}, scrollIntoView: () => {},
        addEventListener(name, fn) { (events[`element:${name}:${this.key}`] ||= []).push(fn); }, key: '',
    });
    const file = { name: 'A.cpp' };
    const problem = { textContent: 'A — Example' };
    const lang = { textContent: 'C++20' };
    const formInputs = { '[data-source-file]': { files: [file] }, '[data-submit-problem]': { selectedOptions: [problem] },
        '[data-submit-language]': { value: 'cc.cc20', selectedOptions: [lang] } };
    const form = { action: '/submit', matches: (selector) => selector.includes('[data-submit-solution]'),
        querySelector: (selector) => formInputs[selector] || null };
    const confirmButton = { ...element(), key: 'confirm' };
    const confirmFields = Object.fromEntries(['file', 'problem', 'language'].map((key) => [`[data-confirm-${key}]`, element()]));
    const dialog = { open: false, returnValue: '',
        showModal() { this.open = true; }, close(value = '') {
            this.open = false; this.returnValue = value;
            for (const fn of events['element:close:dialog'] || []) fn();
        },
        addEventListener(name, fn) { (events[`element:${name}:dialog`] ||= []).push(fn); },
        querySelector: (selector) => selector === '[data-confirm-submit]' ? confirmButton : confirmFields[selector] };
    const clock = { ...element(), parentElement: element() };
    const progress = element(); const error = element();
    const notify = { ...element(), key: 'notify' }; const read = { ...element(), key: 'read' };
    const noticeText = element(); const noticeLink = element();
    let notices = [];
    const panel = { ...element(), dataset: { arenaNotices: '[]', notificationKey: 'arena:user:contest', notificationCsrf: 'csrf' },
        querySelector: (selector) => selector === '[data-notice-text]' ? noticeText : noticeLink };
    const document = { title: 'Contest', hidden: false,
        documentElement: { dataset: { arenaView: 'problems', arenaState: '/contest/test/arena/state', arenaNow: now,
            arenaStart: start, arenaEnd: end, arenaParticipant: 'true', arenaRestricted: 'false' } },
        getElementById: (id) => id === 'confirm-submit-modal' ? dialog : id === 'arena-error' ? error : null,
        querySelector: (selector) => ({ '[data-countdown]': clock, '.progress-value': progress,
            '[data-arena-notices]': panel, '.notify-button': notify, '[data-read-notices]': read })[selector] || null,
        querySelectorAll: () => [],
        addEventListener: (name, fn) => { (events[`document:${name}`] ||= []).push(fn); } };
    class DesktopNotification {
        static permission = permission;
        static async requestPermission() { return requestedPermission; }
        constructor(title, options) { messages.push({ title, ...options }); }
        addEventListener() {}
    }
    runInNewContext(source, { document,
        window: { Notification: DesktopNotification, isSecureContext: true,
            confirm: () => { throw new Error('Native confirmation would block the contest clock'); },
            addEventListener: (name, fn) => { (events[name] ||= []).push(fn); } },
        Notification: DesktopNotification,
        Date: class extends Date { static now() { return now; } },
        location: { origin: 'http://localhost:8888', href: 'http://localhost:8888/contest/test/arena/problems', search: '' },
        localStorage: { getItem: (key) => stored.get(key) || null, setItem: (key, value) => stored.set(key, value) },
        FormData: class { set() {} }, URL, AbortSignal,
        fetch: async (url, options) => {
            requests.push(options?.method || 'GET');
            return { ok: true, text: async () => JSON.stringify({ rid: 'record' }),
                json: async () => ({ fragments: {}, now, start, end, notices }) };
        },
        setInterval: (callback, delay) => { intervals.push({ callback, delay }); } });
    return { document, events, intervals, requests, messages, dialog, clock, progress, error, stored, panel, noticeText,
        setNotices(value) { notices = value; },
        advance(ms) { now += ms; intervals.find((item) => item.delay === 1000).callback(); },
        async click(key) { await Promise.all((events[`element:click:${key}`] || []).map((fn) => fn())); },
        submit() { return events['document:submit'][0]({ target: form, preventDefault() {} }); } };
}

test('submission confirmation is nonblocking, rejects duplicate submits and keeps clock/progress advancing', async () => {
    const h = harness();
    const submitting = h.submit();
    assert(h.dialog.open);
    assert.equal(h.clock.textContent, '00:02:00');
    const before = h.progress.style['width'];
    h.advance(5000);
    assert.equal(h.clock.textContent, '00:01:55');
    assert.notEqual(h.progress.style['width'], before);
    await h.submit();
    assert.equal(h.requests.length, 0);
    await h.click('confirm');
    await submitting;
    assert.deepEqual(h.requests, ['POST']);
});

test('cancelling confirmation sends nothing; a contest ending during confirmation cannot submit', async () => {
    const h = harness();
    const first = h.submit();
    h.dialog.close(); await first;
    assert.equal(h.requests.length, 0);
    const second = h.submit();
    h.advance(120000); await h.click('confirm');
    await second;
    assert.equal(h.requests.length, 0);
    assert.match(h.error.textContent, /not accepting/);
});

test('blocked desktop permission explains the failure instead of silently ignoring the button', async () => {
    const h = harness('denied'); await h.click('notify');
    assert.match(h.error.textContent, /blocked/);
    assert.equal(h.messages.length, 0);
});

test('an inconsistent browser permission response cannot falsely enable desktop notifications', async () => {
    const h = harness('denied', new Map(), 'granted');
    await h.click('notify');
    assert.match(h.error.textContent, /blocked/);
    assert.notEqual(h.stored.get('arena:user:contest'), 'enabled');
});

test('jury messages appear without desktop permission; enabled notifications survive navigation and poll hidden tabs', async () => {
    const h = harness();
    const notice = { id: 'notice-1', title: 'Announcement', body: '题目已更正', url: '/contest/test/arena/clarification?did=1' };
    h.setNotices([notice]);
    const poll = h.intervals.at(-1).callback;
    poll(); await flush();
    assert.equal(h.panel.hidden, false);
    assert.match(h.noticeText.textContent, /题目已更正/);
    assert.equal(h.messages.length, 0);
    await h.click('notify'); await flush();
    assert.equal(h.stored.get('arena:user:contest'), 'enabled');
    assert.equal(h.messages.filter((m) => m.tag === 'arena-clarification-notice-1').length, 1);
    poll(); await flush();
    assert.equal(h.messages.filter((m) => m.tag === 'arena-clarification-notice-1').length, 1);
    const next = harness('granted', h.stored);
    next.document.hidden = true; next.setNotices([{ ...notice, id: 'notice-2' }]);
    next.intervals.at(-1).callback(); await flush();
    assert.equal(next.messages.filter((m) => m.tag === 'arena-clarification-notice-2').length, 1);
});
