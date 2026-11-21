import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { PRIV } from '@hydrooj/common';
import UserModel from '../packages/hydrooj/src/model/user';
import db from '../packages/hydrooj/src/service/db';

// Run through Hydro CLI with the isolated review server, never against a production DB.
export async function run() {
    assert.match(db.db.databaseName, /^hgnuoj_feature_test_[a-f0-9]+$/);
    const origin = 'http://127.0.0.1:18997';
    const uids = [900_010, 900_011];
    const sessions: string[] = [];
    for (const uid of uids) {
        // eslint-disable-next-line no-await-in-loop
        await UserModel.create(`${uid}@external-review.invalid`, `external-review-${uid}`, randomBytes(24).toString('hex'), uid, '127.0.0.1', PRIV.PRIV_USER_PROFILE);
        const sid = randomBytes(32).toString('hex');
        sessions.push(sid);
        const at = new Date();
        // eslint-disable-next-line no-await-in-loop
        await db.collection('token').insertOne({
            _id: sid, tokenType: 0, uid, scope: '-1', createAt: at, updateAt: at, expireAt: new Date(+at + 600_000),
        });
    }
    const post = async (session: number, values: Record<string, string>) => fetch(`${origin}/home/external-oj`, {
        method: 'POST', redirect: 'manual',
        headers: {
            Authorization: `Bearer ${sessions[session]}`, Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded', Origin: origin, Referer: `${origin}/home/external-oj`,
        },
        body: new URLSearchParams(values),
    });
    const binding = (uid: number) => db.collection('external.oj.binding').findOne({ uid, platform: 'codeforces' });
    const accepted = (response: Response) => assert.ok([200, 302, 303].includes(response.status), `Unexpected HTTP ${response.status}`);
    const anonymous = await fetch(`${origin}/home/external-oj`, { redirect: 'manual', headers: { Accept: 'application/json' } });
    const anonymousBody = anonymous.status === 200 ? await anonymous.json() : null;
    assert.ok([302, 401, 403].includes(anonymous.status) || anonymousBody?.url?.startsWith('/login?'), `Anonymous response ${JSON.stringify(anonymousBody)}`);
    const authenticated = await fetch(`${origin}/home/external-oj`, { headers: { Authorization: `Bearer ${sessions[0]}`, Accept: 'application/json' } });
    assert.equal(authenticated.status, 200);
    accepted(await post(0, { operation: 'bind', platform: 'codeforces', handle: 'http-review-a' }));
    accepted(await post(1, { operation: 'bind', platform: 'codeforces', handle: 'http-review-b' }));
    assert.equal((await binding(uids[0])).handle, 'http-review-a');
    assert.equal((await binding(uids[1])).handle, 'http-review-b');
    const duplicate = await post(0, { operation: 'bind', platform: 'codeforces', handle: 'HTTP-REVIEW-B' });
    assert.equal(duplicate.status, 409);
    assert.equal((await binding(uids[0])).handle, 'http-review-a');
    assert.equal((await binding(uids[1])).handle, 'http-review-b');
    const malformed = await post(0, { operation: 'bind', platform: 'luogu', handle: 'invalid-uid' });
    assert.equal(malformed.status, 400);
    accepted(await post(0, { operation: 'bind', platform: 'codeforces', handle: 'http-review-changed', uid: String(uids[1]) }));
    assert.equal((await binding(uids[0])).handle, 'http-review-changed');
    assert.equal((await binding(uids[1])).handle, 'http-review-b');
    const cooldownRefresh = await post(0, { operation: 'refresh', platform: 'codeforces' });
    assert.equal(cooldownRefresh.status, 429);
    accepted(await post(0, { operation: 'unbind', platform: 'codeforces', uid: String(uids[1]) }));
    const unboundRefresh = await post(0, { operation: 'refresh', platform: 'codeforces' });
    assert.equal(unboundRefresh.status, 400);
    assert.equal(await binding(uids[0]), null);
    assert.equal((await binding(uids[1])).handle, 'http-review-b');
    return 'HGNU_EXTERNAL_HTTP_OK';
}
