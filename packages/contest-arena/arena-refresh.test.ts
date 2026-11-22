import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('./frontend/arena.js', import.meta.url), 'utf8');
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
function harness(ended = false, view = 'home') {
    const events: Record<string, () => void> = {}, intervals: { callback: () => void; delay: number }[] = [];
    let requests = 0, reloads = 0;
    const now = Date.now(), start = now - 3600000, end = now + 3600000;
    let state: any = { fragments: {}, now, start, end, before: false, ended: false, participantEnded: ended, restrictExit: false };
    const submitAttributes: Record<string, string> = {};
    const submit = { classList: { toggle: () => {} }, setAttribute: (name: string, value: string) => { submitAttributes[name] = value; } };
    const draft = { value: '' }, panel = { dataset: { arenaLive: 'jury-requests' }, innerHTML: 'original request',
        querySelector: () => null, querySelectorAll: (selector: string) => selector === 'textarea' ? [draft] : [] };
    runInNewContext(source, {
        document: { documentElement: { dataset: { arenaView: view, arenaState: '/contest/test/arena/state',
            arenaNow: String(now), arenaStart: String(start), arenaEnd: String(end), arenaRestricted: 'false',
            arenaParticipant: 'true', arenaEnded: 'false', arenaParticipantEnded: String(ended) } },
        hidden: false, querySelector: (selector: string) => selector === '[data-arena-live="jury-requests"]' ? panel : null,
        querySelectorAll: (selector: string) => selector === '[data-open-submit]' ? [submit]
            : selector === '[data-arena-live]' && view === 'jury' ? [panel] : [], getElementById: () => null,
        addEventListener: (name, callback) => { events[`document:${name}`] = callback; } },
        window: { addEventListener: (name, callback) => { events[name] = callback; } },
        location: { origin: 'http://localhost:8888', search: '', href: 'http://localhost:8888/contest/test/arena', reload: () => { reloads++; } },
        fetch: async () => { requests++; return { ok: true, json: async () => state }; },
        setInterval: (callback, delay) => { intervals.push({ callback, delay }); }, URL, AbortSignal,
    });
    return { events, intervals, requests: () => requests, reloads: () => reloads, submitAttributes, draft, panel,
        setState: (updates: any) => { state = { ...state, ...updates }; } };
}
test('returning to a cached arena page resumes judgement and freeze polling', async () => {
    const h = harness(), poll = h.intervals.at(-1).callback;
    h.events.pagehide(); poll(); await flush(); assert.equal(h.requests(), 0);
    h.events.pageshow(); await flush(); assert.equal(h.requests(), 1);
    poll(); await flush(); assert.equal(h.requests(), 2);
    assert.equal(h.reloads(), 0);
});
test('network recovery and focus immediately refresh the arena state', async () => {
    const h = harness();
    for (const event of ['online', 'focus']) { h.events[event](); await flush(); }
    assert.equal(h.requests(), 2);
    assert.equal(h.reloads(), 0);
});

test('an already-open contest page refreshes its controls when the contest ends', async () => {
    const h = harness();
    h.setState({ ended: true });
    h.events.focus(); await flush();
    assert.equal(h.reloads(), 1, 'End-of-contest controls must not stay in their pre-end state');
});

test('an individually ended participant is not offered submission by the global contest clock', () => {
    const h = harness(true);
    assert.equal(h.submitAttributes['aria-disabled'], 'true');
});

test('an administrator resuming an individual participant refreshes the controls', async () => {
    const h = harness(true);
    h.setState({ participantEnded: false });
    h.events.focus(); await flush();
    assert.equal(h.reloads(), 1);
});

test('new jury requests appear without a page reload', async () => {
    const h = harness(false, 'jury');
    h.setState({ fragments: { 'jury-requests': 'new request from another team' } });
    h.events.focus(); await flush();
    assert.equal(h.panel.innerHTML, 'new request from another team');
    assert.equal(h.reloads(), 0);
    assert.equal(h.intervals.at(-1).delay, 4000);
});

test('jury refresh preserves a reply draft and applies queued updates after it is cleared', async () => {
    const h = harness(false, 'jury'); h.draft.value = 'Reply being typed';
    h.setState({ fragments: { 'jury-requests': 'updated request with a new follow-up' } });
    h.events.focus(); await flush(); assert.equal(h.panel.innerHTML, 'original request');
    assert.equal(h.draft.value, 'Reply being typed');
    h.draft.value = ''; h.events.focus(); await flush();
    assert.equal(h.panel.innerHTML, 'updated request with a new follow-up');
});
