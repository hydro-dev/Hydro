/* eslint-disable no-await-in-loop -- Polling steps must observe updates in order. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('./frontend/arena.js', import.meta.url), 'utf8');
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
function harness(ended = false, view = 'home') {
    const events: Record<string, () => void> = {};
    const intervals: { callback: () => void, delay: number }[] = [];
    let requests = 0;
    let reloads = 0;
    const now = Date.now();
    const start = now - 3600000;
    const end = now + 3600000;
    let state: any = {
        fragments: {},
        now,
        start,
        end,
        before: false,
        ended: false,
        participantEnded: ended,
        restrictExit: false,
    };
    const submitAttributes: Record<string, string> = {};
    const submit = {
        classList: { toggle: () => {} },
        setAttribute: (name: string, value: string) => {
            submitAttributes[name] = value;
        },
    };
    const draft = { value: '' };
    const panel = {
        dataset: { arenaLive: 'jury-requests' },
        innerHTML: 'original request',
        querySelector: () => null,
        querySelectorAll: (selector: string) => (selector === 'textarea' ? [draft] : []),
    };
    runInNewContext(source, {
        document: {
            documentElement: {
                dataset: {
                    arenaView: view,
                    arenaState: '/contest/test/arena/state',
                    arenaNow: String(now),
                    arenaStart: String(start),
                    arenaEnd: String(end),
                    arenaRestricted: 'false',
                    arenaParticipant: 'true',
                    arenaEnded: 'false',
                    arenaParticipantEnded: String(ended),
                },
            },
            hidden: false,
            querySelector: (selector: string) => (selector === '[data-arena-live="jury-requests"]' ? panel : null),
            querySelectorAll: (selector: string) =>
                selector === '[data-open-submit]'
                    ? [submit]
                    : selector === '[data-arena-live]' && view === 'jury'
                        ? [panel]
                        : [],
            getElementById: () => null,
            addEventListener: (name, callback) => {
                events[`document:${name}`] = callback;
            },
        },
        window: {
            addEventListener: (name, callback) => {
                events[name] = callback;
            },
        },
        location: {
            origin: 'http://localhost:8888',
            search: '',
            href: 'http://localhost:8888/contest/test/arena',
            reload: () => {
                reloads++;
            },
        },
        fetch: async () => {
            requests++;
            return { ok: true, json: async () => state };
        },
        setInterval: (callback, delay) => {
            intervals.push({ callback, delay });
        },
        URL,
        AbortSignal,
    });
    return {
        events,
        intervals,
        requests: () => requests,
        reloads: () => reloads,
        submitAttributes,
        draft,
        panel,
        setState: (updates: any) => {
            state = { ...state, ...updates };
        },
    };
}
test('returning to a cached arena page resumes judgement and freeze polling', async () => {
    const h = harness();
    const poll = h.intervals.at(-1).callback;
    h.events.pagehide();
    poll();
    await flush();
    assert.equal(h.requests(), 0);
    h.events.pageshow();
    await flush();
    assert.equal(h.requests(), 1);
    poll();
    await flush();
    assert.equal(h.requests(), 2);
    assert.equal(h.reloads(), 0);
});
test('network recovery and focus immediately refresh the arena state', async () => {
    const h = harness();
    for (const event of ['online', 'focus']) {
        h.events[event]();
        await flush();
    }
    assert.equal(h.requests(), 2);
    assert.equal(h.reloads(), 0);
});

test('an already-open contest page refreshes its controls when the contest ends', async () => {
    const h = harness();
    h.setState({ ended: true });
    h.events.focus();
    await flush();
    assert.equal(h.reloads(), 1, 'End-of-contest controls must not stay in their pre-end state');
});

test('an individually ended participant is not offered submission by the global contest clock', () => {
    const h = harness(true);
    assert.equal(h.submitAttributes['aria-disabled'], 'true');
});

test('an administrator resuming an individual participant refreshes the controls', async () => {
    const h = harness(true);
    h.setState({ participantEnded: false });
    h.events.focus();
    await flush();
    assert.equal(h.reloads(), 1);
});

test('new jury requests appear without a page reload', async () => {
    const h = harness(false, 'jury');
    h.setState({ fragments: { 'jury-requests': 'new request from another team' } });
    h.events.focus();
    await flush();
    assert.equal(h.panel.innerHTML, 'new request from another team');
    assert.equal(h.reloads(), 0);
    assert.equal(h.intervals.at(-1).delay, 4000);
});

test('jury refresh preserves a reply draft and applies queued updates after it is cleared', async () => {
    const h = harness(false, 'jury');
    h.draft.value = 'Reply being typed';
    h.setState({ fragments: { 'jury-requests': 'updated request with a new follow-up' } });
    h.events.focus();
    await flush();
    assert.equal(h.panel.innerHTML, 'original request');
    assert.equal(h.draft.value, 'Reply being typed');
    h.draft.value = '';
    h.events.focus();
    await flush();
    assert.equal(h.panel.innerHTML, 'updated request with a new follow-up');
});

test('submission modal keeps polling completed results and updates only the live fragment during rejudge', async () => {
    const callbacks: Record<string, ((event?: any) => void)[]> = {};
    const intervals: { callback: () => void, delay: number }[] = [];
    const requests: string[] = [];
    const now = Date.now();
    const opened = { dataset: { detailKey: 'case-1-2' }, open: true };
    const closed = { dataset: { detailKey: 'case-1-3' }, open: false };
    const fragment = {
        innerHTML: 'CORRECT',
        scrollTop: 50,
        querySelectorAll: (selector: string) => selector.includes('[open]') ? [opened] : [opened, closed],
    };
    let bodyWrites = 0;
    let bodyHtml = '';
    const body = {
        textContent: '',
        get innerHTML() { return bodyHtml; },
        set innerHTML(html: string) { bodyWrites++; bodyHtml = html; },
    };
    const title = { textContent: '' };
    const dialog = {
        open: false,
        showModal() { this.open = true; },
        setAttribute: () => {},
        removeAttribute: () => {},
        querySelectorAll: () => [],
        querySelector: (selector: string) => selector === '#detail-title'
            ? title : selector === '[data-detail-body]' ? body : fragment,
    };
    let nextResult = 'JUDGING';
    let hidden = false;
    runInNewContext(source, {
        document: {
            documentElement: { dataset: {
                arenaView: 'jury', arenaState: '/contest/test/arena/state', arenaNow: now,
                arenaStart: now - 3600000, arenaEnd: now + 3600000,
            } },
            get hidden() { return hidden; },
            querySelector: () => null,
            querySelectorAll: () => [],
            getElementById: (id: string) => id === 'detail-modal' ? dialog : null,
            addEventListener: (name: string, callback: (event: any) => void) => { (callbacks[name] ||= []).push(callback); },
        },
        window: { addEventListener: () => {} },
        location: { origin: 'http://localhost:8888', href: 'http://localhost:8888/contest/test/arena/jury', search: '' },
        fetch: async (url: URL) => {
            requests.push(url.href);
            return { ok: true, json: async () => url.pathname.endsWith('/state')
                ? { fragments: { 'submission-status': nextResult } }
                : { title: 'Submission details', html: 'detail with expanded source code' } };
        },
        setInterval: (callback: () => void, delay: number) => { intervals.push({ callback, delay }); },
        URL,
        AbortSignal,
    });
    const link = { href: 'http://localhost:8888/contest/test/arena/submission?rid=record' };
    callbacks.click[0]({ target: { closest: (selector: string) => selector === '[data-arena-modal]' ? link : null },
        button: 0, preventDefault: () => {} });
    await flush();
    assert.equal(requests.length, 1);
    assert(requests[0].includes('modal=1'));
    assert.equal(bodyWrites, 1);
    const poll = intervals.find((item) => item.delay === 4000).callback;
    poll();
    await flush();
    assert.equal(fragment.innerHTML, 'JUDGING');
    assert.equal(bodyWrites, 1, 'Source code and action buttons must not be replaced by status polling');
    assert(requests[1].includes('/state?rid=record&view=submission'));
    assert.equal(opened.open, true);
    assert.equal(closed.open, false);
    assert.equal(fragment.scrollTop, 50);
    nextResult = 'CORRECT with new testcases';
    poll();
    await flush();
    assert.equal(fragment.innerHTML, nextResult);
    assert.equal(bodyWrites, 1);
    hidden = true;
    poll();
    await flush();
    assert.equal(requests.length, 3, 'Background tabs must not poll details');
    hidden = false;
    dialog.open = false;
    poll();
    await flush();
    assert.equal(requests.length, 3, 'Closed modals must not poll details');
});
