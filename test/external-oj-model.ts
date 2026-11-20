import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { EXTERNAL_PLATFORMS, ExternalOjRateLimit } from '../packages/hydrooj/src/lib/externalOjs';
import { nextBeijingNoon } from '../packages/hydrooj/src/lib/externalOjStats';
import {
    acquireExternalOjQueue, bindExternalOj, claimExternalOjRequest, ExternalOjBudgetExhausted,
    getExternalOjBindings, releaseExternalOjQueue, syncDueExternalOj, unbindExternalOj,
} from '../packages/hydrooj/src/model/externalOj';
import db from '../packages/hydrooj/src/service/db';

async function verifyScale() {
    const users = 1700;
    const cap = 1600;
    const round = nextBeijingNoon(new Date(Date.now() + 7 * 86_400_000));
    const coll = db.collection('external.oj.binding');
    // Dedicated test database; clear only the three bindings made earlier in the same test.
    await coll.deleteMany({ uid: { $in: [900_001, 900_002] } });
    await coll.insertMany(EXTERNAL_PLATFORMS.flatMap((platform) => Array.from({ length: users }, (_, i) => ({
        uid: i + 1_000_000,
        platform,
        accountKey: `${platform}:synthetic-${i}`,
        handle: `synthetic-${i}`,
        syncAfter: round,
        revision: new ObjectId(),
    }))));
    const started = performance.now();
    await Promise.all(EXTERNAL_PLATFORMS.map(async (platform) => {
        let requests = 0;
        const doMockRequest: Parameters<typeof syncDueExternalOj>[2] = async (_platform, _, _previous, opts) => {
            await opts.beforeRequest();
            requests++;
            return { total: 3 };
        };
        // eslint-disable-next-line no-await-in-loop -- Exercise the real serial queue of one platform.
        while (await syncDueExternalOj(platform, round, doMockRequest, cap)) { /* drain */ }
        assert.equal(requests, cap);
        assert.equal(await coll.countDocuments({ platform, total: 3 }), cap);
        assert.equal(await coll.countDocuments({ platform, syncAfter: round, failedAt: { $exists: false } }), users - cap);
        assert.equal(await syncDueExternalOj(platform, round, doMockRequest, cap), false);

        const tomorrow = nextBeijingNoon(round);
        for (let i = 0; i < users - cap; i++) {
            // eslint-disable-next-line no-await-in-loop -- Confirm overdue accounts resume first.
            assert.equal(await syncDueExternalOj(platform, tomorrow, doMockRequest, cap), true);
        }
        assert.equal(await coll.countDocuments({ platform, total: 3 }), users);
        assert.equal(requests, users);
    }));
    console.log('HGNU_EXTERNAL_SCALE_OK', users, users * EXTERNAL_PLATFORMS.length, Math.round(performance.now() - started));
}

// Run from Hydro CLI against a dedicated test DB; the injected adapters never reach external sites.
export async function run() {
    assert.match(db.db.databaseName, /^hgnuoj_feature_test_[a-f0-9]+$/);
    const firstUid = 900_001;
    const secondUid = 900_002;
    const site = 'codeforces';
    const noon = nextBeijingNoon(new Date());
    await bindExternalOj(firstUid, site, 'hgnubindingtest');
    await assert.rejects(bindExternalOj(secondUid, site, 'hgnubindingtest'));
    assert.equal((await getExternalOjBindings(secondUid)).length, 0);
    assert.equal(await syncDueExternalOj(site, new Date(noon.getTime() - 1000), async () => ({ total: 4 })), false);
    const recent = [{ problem: 'recent:1', at: new Date(+noon - 45_000) }];
    const olderSolved = ['old:1', 'old:2', 'old:3'];
    assert.equal(await syncDueExternalOj(site, noon, async () => ({ total: 4, solves: recent, olderSolved })), true);
    assert.equal(await syncDueExternalOj(site, noon, async () => ({ total: 999 })), false);
    const [synced] = await getExternalOjBindings(firstUid);
    assert.equal(synced.total, 4);
    assert.deepEqual(synced.solves, recent);
    assert.equal(synced.olderSolved, undefined); // Profile/settings queries do not load the lifetime ID set.
    const stored = await db.collection('external.oj.binding').findOne({ uid: firstUid, platform: site });
    assert.deepEqual(stored.olderSolved, olderSolved);
    assert.equal(+stored.cursorAt, +noon);

    const following = nextBeijingNoon(noon);
    await syncDueExternalOj(site, following, async () => { throw new Error('provider unavailable'); });
    const [failed] = await getExternalOjBindings(firstUid);
    assert.equal(failed.total, 4);
    assert.equal(failed.lastSuccessAt.toISOString(), synced.lastSuccessAt.toISOString());
    assert.ok(failed.failedAt);

    const ready = Promise.withResolvers<void>();
    const fetchResult = Promise.withResolvers<{ total: number }>();
    const activeJob = syncDueExternalOj(site, nextBeijingNoon(following), async () => {
        ready.resolve();
        return await fetchResult.promise;
    });
    await ready.promise;
    await bindExternalOj(firstUid, site, 'replacementhandle');
    fetchResult.resolve({ total: 500 });
    await activeJob;
    const [rebound] = await getExternalOjBindings(firstUid);
    assert.equal(rebound.handle, 'replacementhandle');
    assert.equal(rebound.total, undefined);
    assert.equal(rebound.lastSuccessAt, undefined);
    assert.equal(rebound.failedAt, undefined);
    await unbindExternalOj(firstUid, site);
    assert.deepEqual(await getExternalOjBindings(firstUid), []);
    await bindExternalOj(secondUid, site, 'replacementhandle');
    await unbindExternalOj(secondUid, site);

    await bindExternalOj(firstUid, site, 'AccountA');
    await bindExternalOj(secondUid, site, 'AccountB');
    await bindExternalOj(secondUid, 'luogu', '42');
    assert.equal(await syncDueExternalOj(site, noon, async () => { throw new ExternalOjRateLimit(120_000); }), true);
    let nextCalled = false;
    const fetchNext = async () => {
        nextCalled = true;
        return { total: 1 };
    };
    assert.equal(await syncDueExternalOj(site, new Date(+noon + 60_000), fetchNext), false);
    assert.equal(nextCalled, false);
    assert.equal(await syncDueExternalOj('luogu', noon, fetchNext), true);
    assert.equal(await syncDueExternalOj(site, new Date(+noon + 121_000), fetchNext), true);

    const competing = await Promise.all(Array.from({ length: 6 }, () => acquireExternalOjQueue('atcoder', noon)));
    assert.equal(competing.filter(Boolean).length, 1);
    assert.equal(await acquireExternalOjQueue('atcoder', new Date(+noon + 60_000)), null);
    await releaseExternalOjQueue('atcoder', competing.find(Boolean), noon);
    assert.equal(await acquireExternalOjQueue('atcoder', new Date(+noon + 1000)), null);
    assert.ok(await acquireExternalOjQueue('atcoder', new Date(+noon + 60_000)));

    const quota = await Promise.allSettled(Array.from({ length: 16 }, () => claimExternalOjRequest('nowcoder', noon, 8)));
    assert.equal(quota.filter((r) => r.status === 'fulfilled').length, 8);
    assert.ok(quota.every((r) => r.status === 'fulfilled' || r.reason instanceof ExternalOjBudgetExhausted));
    await assert.rejects(claimExternalOjRequest('nowcoder', new Date(+noon + 13 * 60 * 60_000), 8), ExternalOjBudgetExhausted);
    await claimExternalOjRequest('nowcoder', nextBeijingNoon(noon), 8);
    if (process.env.HGNUOJ_EXTERNAL_SCALE === '1') await verifyScale();
    return 'HGNU_EXTERNAL_MODEL_OK';
}
