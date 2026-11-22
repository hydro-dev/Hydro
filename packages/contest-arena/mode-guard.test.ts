/* eslint-disable no-await-in-loop -- Clock and navigation assertions must run in order. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';

const source = readFileSync(new URL('./frontend/mode-guard.js', import.meta.url), 'utf8');
const target = '/d/system/contest/123456789012345678901234/arena';
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

function harness(pathname: string, initial: any) {
    let state = initial;
    const redirects: string[] = [];
    const timers = new Map<number, { callback: () => void, delay: number }>();
    const events: Record<string, () => void> = {};
    let serial = 0;
    runInNewContext(source, {
        window: {
            addEventListener: (name, callback) => {
                events[name] = callback;
            },
        },
        document: {
            hidden: false,
            addEventListener: (name, callback) => {
                events[name] = callback;
            },
        },
        location: { pathname, origin: 'http://localhost:8888', replace: (url) => redirects.push(url) },
        fetch: async () => ({ ok: true, json: async () => state }),
        URL,
        AbortSignal,
        setTimeout: (callback, delay) => {
            timers.set(++serial, { callback, delay });
            return serial;
        },
        clearTimeout: (id) => timers.delete(id),
    });
    return {
        redirects,
        timers,
        events,
        setState: (value: any) => {
            state = value;
        },
    };
}

test('a page opened early schedules the boundary and redirects without interaction', async () => {
    const h = harness('/p', { active: false, startsAt: 5000, now: 1000 });
    await flush();
    assert.equal(h.redirects.length, 0);
    const timer = [...h.timers.values()][0];
    assert.equal(timer.delay, 4000);
    h.setState({ active: true, redirect: target, startsAt: 5000, now: 5000 });
    timer.callback();
    await flush();
    assert.deepEqual(h.redirects, [target]);
    assert.equal(h.timers.size, 0);
});

test('own canonical and native arena subpages do not enter a redirect or rapid-poll loop', async () => {
    for (const path of [
        target,
        `${target}/languages`,
        target.replace('/d/system', ''),
        `${target.replace('/d/system', '')}/submission`,
    ]) {
        const h = harness(path, { active: true, redirect: target, startsAt: 1000, now: 5000 });
        await flush();
        assert.equal(h.redirects.length, 0);
        assert.equal([...h.timers.values()][0].delay, 10000);
    }
    const other = harness('/contest/another/arena', { active: true, redirect: target });
    await flush();
    assert.deepEqual(other.redirects, [target]);
});

test('focus, restored pages and recovered connections recheck account mode immediately', async () => {
    for (const event of ['focus', 'online', 'pageshow', 'visibilitychange']) {
        const h = harness('/logout', { active: false, startsAt: 100000, now: 0 });
        await flush();
        h.setState({ active: true, redirect: target });
        h.events[event]();
        await flush();
        assert.deepEqual(h.redirects, [target], event);
    }
    const exempt = harness('/p', { active: false, startsAt: null, now: 0 });
    await flush();
    assert.equal(exempt.redirects.length, 0);
});
