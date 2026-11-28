/* eslint-disable no-await-in-loop -- Remove only the test-owned collections sequentially. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
const require = createRequire(import.meta.url);
require('@hydrooj/register');
const { MongoClient } = require('mongodb');
const { LiveStore, InvalidFeedToken }: typeof import('./live-store') = require('./live-store.ts');
const uri = process.env.HGNU_ARENA_TEST_MONGO;
const snapshot = (value: number, policy = 'stable') => ({
    policy, objects: [{ type: 'contest', data: { id: 'fixture' } }, { type: 'state', data: { value } }],
}) as any;

test('Mongo journal survives restarts, interrupted commits, lost leases and concurrent writers', { skip: !uri }, async () => {
    const client = await MongoClient.connect(uri);
    const db = client.db();
    // Never write application collections. These three randomly named collections are owned by this test.
    const prefix = `verify_live_${process.pid}_${Date.now()}`;
    const states = db.collection(`${prefix}_state`);
    const batches = db.collection(`${prefix}_batches`);
    const events = db.collection(`${prefix}_events`);
    const fresh = () => new LiveStore(states, batches, events);
    const proxy = (collection: any, hook: (method: string, args: any[]) => boolean) => new Proxy(collection, {
        get(target, key) {
            const value = target[key];
            return typeof value !== 'function' ? value : (...args: any[]) => {
                if (hook(String(key), args)) throw new Error('injected interruption');
                return value.apply(target, args);
            };
        },
    });
    try {
        const scope = 'restart'; const store = fresh();
        const one = await store.publish(scope, async () => snapshot(1));
        const checkpoint = await store.checkpoint(scope, one);
        assert.deepEqual(await store.checkpoint(scope, one), checkpoint);
        const initial = await store.read(scope, checkpoint, one.state, 1);
        assert.equal(initial.length, 1);
        const token = store.token(scope, initial[0].cursor);
        const resumed = await fresh().resume(scope, token, one);
        const rest = await fresh().read(scope, resumed, one.state);
        assert.equal(rest.length, 1);
        assert.equal(rest[0].event.data.value, 1);
        const endToken = store.token(scope, rest[0].cursor);
        const two = await store.publish(scope, async () => snapshot(2));
        const delta = await fresh().read(scope, await fresh().resume(scope, endToken, two), two.state);
        assert.equal(delta.length, 1);
        assert.equal(delta[0].event.data.value, 2);
        await assert.rejects(() => fresh().resume('another contest', endToken, two), InvalidFeedToken);
        const reset = await store.publish(scope, async () => snapshot(3, 'new-policy'));
        await assert.rejects(() => fresh().resume(scope, endToken, reset), InvalidFeedToken);

        // Events written before the atomic publication point remain invisible after a crash.
        let fail = true;
        const crashingStates = proxy(states, (method, args) => {
            if (fail && method === 'updateOne' && args[1]?.$set?.version) {
                fail = false;
                return true;
            }
            return false;
        });
        await assert.rejects(() => new LiveStore(crashingStates, batches, events)
            .publish(scope, async () => snapshot(999, 'new-policy')), /injected interruption/);
        const recovered = await fresh().publish(scope, async () => snapshot(4, 'new-policy'));
        assert.equal(recovered.state.version, reset.state.version + 1);
        const visible = await fresh().read(scope, await fresh().checkpoint(scope, recovered), recovered.state);
        assert.equal(visible.find((row) => row.event.type === 'state').event.data.value, 4);

        // A CAS-published head remains recoverable even if its convenience flag was not set.
        fail = true;
        const crashingBatches = proxy(batches, (method, args) => {
            if (fail && method === 'updateOne' && !args[0]?.scope && args[1]?.$set?.committed) {
                fail = false;
                return true;
            }
            return false;
        });
        await assert.rejects(() => new LiveStore(states, crashingBatches, events)
            .publish(scope, async () => snapshot(5, 'new-policy')), /injected interruption/);
        const head = await states.findOne({ _id: scope });
        assert.equal(head.version, recovered.state.version + 1);
        const afterCrash = await fresh().publish(scope, async () => snapshot(6, 'new-policy'));
        assert.equal(afterCrash.state.version, head.version + 1);
        assert.equal((await batches.findOne({ _id: head.head })).committed, true);

        // A delayed writer may not release another owner's lease or publish stale data.
        await assert.rejects(() => fresh().publish('fenced', async () => {
            await states.updateOne({ _id: 'fenced' }, { $set: { owner: 'replacement', lockUntil: new Date(Date.now() + 60000) } });
            return snapshot(7);
        }), /锁已失效/);
        assert.equal((await states.findOne({ _id: 'fenced' })).owner, 'replacement');
        assert.equal((await states.findOne({ _id: 'fenced' })).version, 0);

        let source = 0;
        await Promise.all(Array.from({ length: 6 }, () => fresh().publish('parallel', async () => {
            const current = ++source;
            await new Promise((resolve) => setTimeout(resolve, 30));
            return snapshot(current);
        })));
        const final = await fresh().publish('parallel', async () => snapshot(source));
        assert.equal(final.state.version, 6);
        const all = await fresh().read('parallel', { kind: 'd', id: '0', version: 0, index: -1 }, final.state);
        assert.deepEqual(all.filter((row) => row.event.type === 'state').map((row) => row.event.data.value), [1, 2, 3, 4, 5, 6]);
    } finally {
        for (const collection of [states, batches, events]) {
            await collection.drop().catch((error) => { if (error.code !== 26) throw error; });
        }
        await client.close();
    }
});
