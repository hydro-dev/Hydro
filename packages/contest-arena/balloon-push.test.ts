/* eslint-disable no-await-in-loop -- Check each test-owned assignment and remove its collections in order. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url);
require('@hydrooj/register');
const { MongoClient } = require('mongodb');
const { PushSecrets, deliveryLink, matchesDeliveryToken, newDeliveryToken, nextPushRunner,
    pushBaseUrl, pushMessage, pushScope, secretHash, sendWxPusher }: typeof import('./balloon-push-data') = require('./balloon-push-data.ts');
const { BalloonPushStore }: typeof import('./balloon-push-store') = require('./balloon-push-store.ts');
const uri = process.env.HGNU_ARENA_TEST_MONGO;
const spt = (n: number) => `SPT_VERIFICATION_RECIPIENT_${n}`;
const runners = [1, 2, 3].map((uid) => ({ uid, username: `runner${uid}`, name: `发放员${uid}`, active: true, spt: spt(uid) }));

test('delivery links use task-bound unpredictable credentials and authenticated encryption with key rotation', async () => {
    let keys = ['test-server-secret-key-with-at-least-32-characters'];
    const secrets = new PushSecrets(async () => keys);
    const token = newDeliveryToken(); const id = 'a'.repeat(64);
    const box = await secrets.seal(token, `${id}/token`);
    assert.equal(await secrets.open(box, `${id}/token`), token);
    assert(!JSON.stringify(box).includes(token));
    await assert.rejects(() => secrets.open(box, 'another-task/token'));
    await assert.rejects(() => secrets.open({ ...box, tag: '0'.repeat(32) }, `${id}/token`));
    keys = ['rotated-test-server-secret-key-with-at-least-32-characters', ...keys];
    assert.equal(await secrets.open(box, `${id}/token`), token);
    assert(matchesDeliveryToken(secretHash(token), token));
    assert(!matchesDeliveryToken(secretHash(token), newDeliveryToken()));
    assert(!matchesDeliveryToken(secretHash(token), null));
    const url = new URL(deliveryLink('https://oj.example', id, token));
    assert.equal(url.search, ''); assert.equal(url.hash, `#${token}`);
    assert(!url.pathname.includes(token));
});

test('notification links and data remain HTML-safe and addresses reject credentials or injected paths', () => {
    for (const bad of ['javascript:alert(1)', 'https://user:pass@oj.example', 'https://oj.example/path', 'https://oj.example/?secret=x']) {
        assert.throws(() => pushBaseUrl(bad));
    }
    assert.equal(pushBaseUrl('https://oj.example/'), 'https://oj.example');
    const m = pushMessage({ _id: 'a'.repeat(64), name: '<img>' }, { contestTitle: '<script>',
        team: 'A&B', className: '<class>', label: 'A', colorName: '红色' }, 'https://oj.example', 'b'.repeat(64));
    assert(!m.content.includes('<script>')); assert(m.content.includes('&lt;script&gt;'));
    assert(!m.content.includes('<img>')); assert(m.content.includes('A&amp;B'));
    assert.equal(m.contentType, 2); assert(m.url.endsWith(`#${'b'.repeat(64)}`));
    assert.equal(nextPushRunner(runners, null).uid, 1);
    assert.equal(nextPushRunner(runners.map((r) => ({ ...r, active: r.uid !== 2 })), 1).uid, 3);
    assert.equal(nextPushRunner([], null), null);
});

test('WxPusher checks HTTP and business/recipient outcomes without contacting real recipients', async () => {
    let calls = 0;
    const transport: any = async (url, options) => {
        calls++; assert.equal(url, 'https://wxpusher.zjiecode.com/api/send/message/simple-push');
        assert.equal(options.method, 'POST'); assert.equal(options.redirect, 'error');
        assert.equal(JSON.parse(options.body).spt, spt(1));
        return new Response(JSON.stringify({ code: 1000, success: true, data: [{ code: 1000 }] }));
    };
    await sendWxPusher(spt(1), { content: 'synthetic verification', contentType: 1 }, transport);
    assert.equal(calls, 1);
    for (const response of [new Response('', { status: 503 }), new Response('bad-json'),
        new Response(JSON.stringify({ code: 1001, success: false })),
        new Response(JSON.stringify({ code: 1000, data: [{ code: 1000 }, { code: 1001 }] })),
        new Response(JSON.stringify({ code: 1000, data: [] }))]) {
        await assert.rejects(() => sendWxPusher(spt(1), {}, (async () => response) as any));
    }
});

test('courier messages include contest room and seat while keeping HTML safe', () => {
    const message = pushMessage({ _id: 'a'.repeat(64), name: '发放员' }, { contestTitle: '比赛',
        team: '选手', className: '软工2601', label: 'A', colorName: '红色', classroom: '逸夫楼301', seat: '001' },
    'https://oj.example', 'b'.repeat(64));
    assert(message.summary.includes('逸夫楼301')); assert(message.summary.includes('001'));
    assert(message.content.includes('教室：逸夫楼301')); assert(message.content.includes('座位号：001'));
    const escaped = pushMessage({ _id: 'a'.repeat(64), name: '发放员' }, { classroom: '<room>', seat: '"<seat>' },
        'https://oj.example', 'b'.repeat(64));
    assert(!escaped.content.includes('<room>')); assert(!escaped.content.includes('<seat>'));
    assert(escaped.content.includes('&lt;room&gt;')); assert(escaped.content.includes('&lt;seat&gt;'));
});

async function database(callback: (settings: any, jobs: any, secrets: InstanceType<typeof PushSecrets>) => Promise<void>) {
    const client = await MongoClient.connect(uri); const db = client.db();
    const prefix = `verify_balloon_push_${process.pid}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const settings = db.collection(`${prefix}_settings`); const jobs = db.collection(`${prefix}_jobs`);
    const secrets = new PushSecrets(async () => ['test-server-secret-key-with-at-least-32-characters']);
    try { await callback(settings, jobs, secrets); } finally {
        for (const collection of [settings, jobs]) {
            try { await collection.drop(); } catch {}
        }
        await client.close();
    }
}

test('Mongo-backed round robin survives concurrent AC events, duplicate first-blood events and restarts', { skip: !uri }, async () => {
    await database(async (settings, jobs, secrets) => {
        const scope = pushScope('test', 'contest'); const store = new BalloonPushStore(settings, jobs, secrets);
        await store.configure(scope, { enabled: true, baseUrl: 'https://oj.example', revision: '' }, runners, 99);
        const task = (n) => ({ domainId: 'test', contestId: 'contest', balloonId: String(n), expiresAt: new Date(Date.now() + 7200000) });
        const assignments = await Promise.all(Array.from({ length: 12 }, (_, i) => store.assign(scope, task(i))));
        assert.deepEqual(assignments.sort((a, b) => a.sequence - b.sequence).map((j) => j.uid), [1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3]);
        await Promise.all(Array.from({ length: 10 }, () => store.assign(scope, task(0))));
        assert.equal(await jobs.countDocuments({}), 12); assert.equal((await settings.findOne({ _id: scope })).sequence, 12);
        const restarted = new BalloonPushStore(settings, jobs, secrets);
        assert.equal((await restarted.assign(scope, task(12))).uid, 1);
        assert.equal((await restarted.assign(scope, task(13))).uid, 2);
        const raw = JSON.stringify(await settings.findOne({ _id: scope }));
        for (const r of runners) assert(!raw.includes(r.spt));
        const publicConfig = JSON.stringify(await restarted.publicSettings(scope));
        assert(!publicConfig.includes('sptBox')); assert(!publicConfig.includes('fingerprint'));
        assert(!JSON.stringify(await jobs.find({}).toArray()).includes((await restarted.link(assignments[0])).split('#')[1]));
    });
});

test('a crash between cursor reservation and task insertion is repaired without losing a turn', { skip: !uri }, async () => {
    await database(async (settings, jobs, secrets) => {
        const scope = pushScope('test', 'crash'); const store = new BalloonPushStore(settings, jobs, secrets);
        await store.configure(scope, { enabled: true, baseUrl: 'https://oj.example', revision: '' }, runners, 99);
        let crash = true;
        const interrupted = new Proxy(jobs, { get(target, key) {
            if (key === 'updateOne') {
                return (...args) => {
                    if (crash && args[1]?.$setOnInsert) {
                        crash = false; throw new Error('simulated crash');
                    }
                    return target.updateOne(...args);
                };
            }
            const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
        } });
        const task = { domainId: 'test', contestId: 'crash', balloonId: 'one', expiresAt: new Date(Date.now() + 7200000) };
        await assert.rejects(() => new BalloonPushStore(settings, interrupted, secrets).assign(scope, task), /simulated crash/);
        assert((await settings.findOne({ _id: scope })).reservation);
        const recovered = await new BalloonPushStore(settings, jobs, secrets).assign(scope, task);
        assert.equal(recovered.uid, 1); assert.equal(recovered.sequence, 1);
        assert.equal((await store.assign(scope, { ...task, balloonId: 'two' })).uid, 2);
    });
});

test('notification retry retains its runner and confirmation link; pause and transfer preserve the cursor', { skip: !uri }, async () => {
    await database(async (settings, jobs, secrets) => {
        const scope = pushScope('test', 'retry');
        let now = new Date();
        const store = new BalloonPushStore(settings, jobs, secrets, () => now);
        await store.configure(scope, { enabled: true, baseUrl: 'https://oj.example', revision: '' }, runners, 99);
        const task = { domainId: 'test', contestId: 'retry', balloonId: 'one', expiresAt: new Date(+now + 7200000) };
        const job = await store.assign(scope, task); const oldToken = (await store.link(job)).split('#')[1];
        let attempts = 0;
        const view = async () => ({ label: 'A', team: '学生', className: '软工2601', colorName: '红色', contestTitle: '测试赛' });
        await store.process(job._id, view, async () => {
            attempts++; throw new Error('HTTP 503');
        });
        const retry = await jobs.findOne({ _id: job._id });
        assert.equal(retry.uid, 1); assert.equal(retry.status, 'pending');
        assert.equal(retry.attempts, 1);
        assert.equal(+retry.nextAttemptAt - +now, 5000);
        assert.equal((await store.link(retry)).split('#')[1], oldToken);
        now = new Date(+now + 4000);
        await store.process(job._id, view, async () => { attempts++; });
        assert.equal(attempts, 1);
        now = new Date(+now + 1000);
        await store.process(job._id, view, async () => { attempts++; });
        assert.equal(attempts, 2);
        assert.equal((await jobs.findOne({ _id: job._id })).status, 'notified');
        assert.equal((await settings.findOne({ _id: scope })).sequence, 1);
        const oldSettings = await store.publicSettings(scope);
        await store.configure(scope, { ...oldSettings, enabled: true }, runners.map((r) => ({ ...r, spt: '', active: r.uid !== 2 })), 99);
        assert.equal((await store.assign(scope, { ...task, balloonId: 'two' })).uid, 3);
        const transferred = await store.renew(job._id, 3);
        await assert.rejects(() => store.authorize(job._id, oldToken));
        const token = (await store.link(transferred)).split('#')[1];
        assert.equal((await store.authorize(job._id, token)).runner.uid, 3);
        assert.equal((await settings.findOne({ _id: scope })).sequence, 2);
        await assert.rejects(() => store.authorize('a'.repeat(64), token));
        now = new Date(+task.expiresAt + 1); await assert.rejects(() => store.authorize(job._id, token));
    });
});

test('configuration rejects duplicate receivers, stale updates and removal of people holding unfinished tasks', { skip: !uri }, async () => {
    await database(async (settings, jobs, secrets) => {
        const scope = pushScope('test', 'config'); const store = new BalloonPushStore(settings, jobs, secrets);
        for (const invalid of [[runners[0], runners[0]], [{ ...runners[0] }, { ...runners[1], spt: spt(1) }],
            [{ ...runners[0], spt: '' }], [{ ...runners[0], active: false }]]) {
            await assert.rejects(() => store.configure(scope, { enabled: true, baseUrl: 'https://oj.example', revision: '' }, invalid, 99));
        }
        await store.configure(scope, { enabled: true, baseUrl: 'https://oj.example', revision: '' }, runners, 99);
        const job = await store.assign(scope, { domainId: 'test', contestId: 'config', balloonId: 'one', expiresAt: new Date(Date.now() + 7200000) });
        const config = await store.publicSettings(scope);
        await assert.rejects(() => store.configure(scope, { ...config, revision: '' }, runners, 99));
        await assert.rejects(() => store.configure(scope, config, runners.slice(1), 99));
        await store.configure(scope, { ...config, enabled: false }, runners.map((r) => ({ ...r, spt: '' })), 99);
        const token = (await store.link(job)).split('#')[1]; assert.equal((await store.authorize(job._id, token)).job.uid, 1);
    });
});

test('restored AC tasks renew revoked links without undoing an administrator cancellation or consuming a turn', { skip: !uri }, async () => {
    await database(async (settings, jobs, secrets) => {
        const scope = pushScope('test', 'restored'); const store = new BalloonPushStore(settings, jobs, secrets);
        await store.configure(scope, { enabled: true, baseUrl: 'https://oj.example', revision: '' }, runners, 99);
        const job = await store.assign(scope, { domainId: 'test', contestId: 'restored', balloonId: 'one',
            expiresAt: new Date(Date.now() + 7200000) });
        const token = (await store.link(job)).split('#')[1];
        await jobs.updateOne({ _id: job._id }, { $set: { status: 'cancelled', tokenHash: null, cancelReason: 'withdrawn' } });
        const restored = await store.renew(job._id, null, 'withdrawn');
        assert.equal(restored.uid, job.uid); assert.equal(restored.status, 'pending');
        await assert.rejects(() => store.authorize(job._id, token));
        assert.equal((await settings.findOne({ _id: scope })).sequence, 1);
        await jobs.updateOne({ _id: job._id }, { $set: { status: 'cancelled', tokenHash: null, cancelReason: 'undo' } });
        assert.equal((await store.renew(job._id, null, 'withdrawn')).status, 'cancelled');
        assert.equal((await jobs.findOne({ _id: job._id })).tokenHash, null);
    });
});
