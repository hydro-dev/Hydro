import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
const { matchesPassword, sealPassword, openPassword, PresentationCredentials }: typeof import('./live-access') = await import(
    new URL('./live-access.ts', import.meta.url).href
);

const secret = 'SERVER_KEY_FOR_PRESENTATION_TEST_ONLY';
const password = 'ab'.repeat(32);
const cid = '6af18454cd466e0f6c764f12';
const legacy = () => ({ _id: JSON.stringify(['system', cid]), domainId: 'system', contestId: cid, generation: '123456abcdef',
    username: `live-${cid}-123456abcdef`, enabled: true, owner: 3,
    passwordHash: createHash('sha256').update(JSON.stringify(['123456abcdef', password])).digest('hex') });

class MemoryCollection {
    docs = new Map<string, any>();

    async findOne(query: any) {
        await new Promise((resolve) => setImmediate(resolve));
        return structuredClone(this.docs.get(query._id) || null);
    }

    async updateOne(query: any, update: any, options: any = {}) {
        await new Promise((resolve) => setImmediate(resolve));
        let doc = this.docs.get(query._id); const inserted = !doc;
        if (!doc && !options.upsert) return { matchedCount: 0, modifiedCount: 0 };
        if (doc && !Object.entries(query).every(([key, value]) => value === null ? doc[key] == null : doc[key] === value)) {
            return { matchedCount: 0, modifiedCount: 0 };
        }
        doc ||= { _id: query._id, ...structuredClone(update.$setOnInsert || {}) };
        Object.assign(doc, structuredClone(update.$set || {}));
        for (const key of Object.keys(update.$unset || {})) delete doc[key];
        this.docs.set(query._id, doc);
        return { matchedCount: Number(!inserted), modifiedCount: 1 };
    }
}

test('encrypted credentials recover with the server key ring and reject tampering or another scope', () => {
    const c = legacy(); const box = sealPassword(c, password, [secret]);
    const saved = { ...c, passwordBox: box };
    assert.equal(openPassword(saved, [secret]), password);
    assert.equal(openPassword(saved, ['ROTATED_KEY', secret]), password);
    assert.notEqual(sealPassword(c, password, [secret]).iv, box.iv);
    assert(!JSON.stringify(saved).includes(password));
    assert.throws(() => openPassword(saved, ['WRONG_KEY']));
    assert.throws(() => openPassword({ ...saved, _id: 'another-domain' }, [secret]));
    assert.throws(() => openPassword({ ...saved, generation: 'abcdef123456' }, [secret]));
    assert.throws(() => openPassword({ ...saved, passwordBox: { ...box, value: '00'.repeat(64) } }, [secret]));
});

test('parallel creation and later administrator sessions reuse one persisted connection', async () => {
    const collection = new MemoryCollection();
    const stores = Array.from({ length: 10 }, () => new PresentationCredentials(collection, () => [secret]));
    const rows = await Promise.all(stores.map((store) => store.ensure('system', cid, 3)));
    assert.equal(collection.docs.size, 1);
    assert(rows.every((row) => row.password === rows[0].password && row.credential.username === rows[0].credential.username));
    assert(!JSON.stringify([...collection.docs.values()]).includes(rows[0].password));
    const reopened = await new PresentationCredentials(collection, () => [secret]).ensure('system', cid, 9);
    assert.equal(reopened.password, rows[0].password);
    assert.equal(reopened.credential.owner, 3);
});

test('legacy migration preserves existing client passwords and event generations', async () => {
    const collection = new MemoryCollection(); const old = legacy();
    collection.docs.set(old._id, structuredClone(old));
    const store = new PresentationCredentials(collection, () => [secret]);
    const current = await store.ensure('system', cid, 3);
    assert.equal(current.credential.generation, old.generation);
    assert.equal(current.credential.username, old.username);
    assert(matchesPassword(current.credential, password));
    assert(matchesPassword(current.credential, current.password));
    assert.notEqual(current.password, password);
    assert.equal((await store.ensure('system', cid, 4)).password, current.password);
    assert(!matchesPassword(current.credential, 'cd'.repeat(32)));
});

test('a known legacy session is retained, disable does not rotate, and explicit reset revokes old credentials', async () => {
    const collection = new MemoryCollection(); const old = legacy();
    collection.docs.set(old._id, structuredClone(old));
    const store = new PresentationCredentials(collection, () => [secret]);
    const known = { key: old._id, username: old.username, password };
    assert.equal((await store.ensure('system', cid, 3, known)).password, password);
    await store.setEnabled('system', cid, 3, false);
    assert.equal((await store.ensure('system', cid, 3)).credential.enabled, false);
    assert.equal((await store.ensure('system', cid, 3)).password, password);
    await store.setEnabled('system', cid, 3, true);
    const reset = await store.reset('system', cid, 9);
    assert.notEqual(reset.credential.generation, old.generation);
    assert(!matchesPassword(reset.credential, password));
    assert(matchesPassword(reset.credential, reset.password));
    assert.equal(reset.credential.legacyPasswordHashes, undefined);
});
