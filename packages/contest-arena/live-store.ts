/* eslint-disable no-await-in-loop -- Commit and resume an ordered, immutable event journal. */
import { randomBytes } from 'crypto';
import { buildLiveData, changesBetween, feedHash, feedKey, FeedObject } from './live-data';

type Snapshot = ReturnType<typeof buildLiveData>;
export interface LiveCursor { kind: 's' | 'd', id: string, version: number, index: number }
export class InvalidFeedToken extends Error {}
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Immutable batches are published by one atomic state CAS. A reader never observes half a batch.
 * Recovery marks the last committed head before a new writer advances it; losing writers cannot publish.
 * Initial connections get a fresh public checkpoint, never historical pre-freeze verdicts.
 */
export class LiveStore {
    private cache = new Map<string, { version: number, objects: Map<string, FeedObject> }>();

    constructor(private states: any, private batches: any, private events: any) {}

    async ensure(scope: string) {
        try {
            await this.states.updateOne({ _id: scope }, { $setOnInsert: { version: 0, head: null, lockUntil: new Date(0) } }, { upsert: true });
        } catch (error) { if (error.code !== 11000) throw error; }
        return this.states.findOne({ _id: scope });
    }

    private async visible(scope: string, state: any, from: number) {
        return this.batches.find({ scope, kind: 'delta', version: { $gte: from, $lte: state.version },
            $or: [{ committed: true }, { _id: state.head }] }).sort({ version: 1 }).toArray();
    }

    private async materialize(scope: string, state: any) {
        const cached = this.cache.get(scope);
        const previous = cached && cached.version <= state.version ? cached : { version: 0, objects: new Map<string, FeedObject>() };
        const objects = new Map(previous.objects);
        const batches = await this.visible(scope, state, previous.version + 1);
        let expected = previous.version;
        for (const batch of batches) {
            if (batch.version !== ++expected) throw new Error('实时事件日志不连续');
            const records = await this.events.find({ batch: batch._id }).sort({ index: 1 }).toArray();
            if (records.length !== batch.count) throw new Error('实时事件批次不完整');
            for (const { event } of records) {
                if (event.data === null) objects.delete(feedKey(event));
                else objects.set(feedKey(event), event);
            }
        }
        if (expected !== state.version) throw new Error('实时事件日志不完整');
        if (this.cache.size >= 8 && !this.cache.has(scope)) this.cache.delete(this.cache.keys().next().value);
        this.cache.set(scope, { version: state.version, objects });
        return objects;
    }

    private async writeEvents(batch: string, events: FeedObject[], renew?: () => Promise<void>) {
        for (let i = 0; i < events.length; i += 250) {
            if (renew) await renew();
            await this.events.insertMany(events.slice(i, i + 250).map((event, index) => ({
                _id: `${batch}-${i + index}`, batch, index: i + index, event,
            })));
        }
    }

    async publish(scope: string, build: (previousState: any) => Promise<Snapshot>) {
        await this.ensure(scope);
        const owner = randomBytes(16).toString('hex');
        let state;
        for (let i = 0; i < 40; i++) {
            state = await this.states.findOneAndUpdate({ _id: scope, lockUntil: { $lte: new Date() } },
                { $set: { owner, lockUntil: new Date(Date.now() + 60000) } }, { returnDocument: 'after' });
            if (state) break;
            await pause(100);
        }
        if (!state) throw new Error('实时数据正在更新，请稍后重试');
        const renew = async () => {
            const r = await this.states.updateOne({ _id: scope, owner, lockUntil: { $gt: new Date() } },
                { $set: { lockUntil: new Date(Date.now() + 60000) } });
            if (r.matchedCount !== 1) throw new Error('实时更新锁已失效');
        };
        try {
            if (state.head) await this.batches.updateOne({ _id: state.head, scope, version: state.version }, { $set: { committed: true } });
            const previous = await this.materialize(scope, state);
            // Read source data only after acquiring the lease, preventing stale writers from reversing a newer result.
            const snapshot = await build(previous.get('state/')?.data || {});
            await renew();
            const events = changesBetween(previous, snapshot.objects);
            if (events.length || state.policy !== snapshot.policy) {
                const batch = randomBytes(12).toString('hex');
                const version = state.version + 1;
                await this.batches.insertOne({ _id: batch, scope, kind: 'delta', version, count: events.length,
                    policy: snapshot.policy, committed: false, createdAt: new Date() });
                await this.writeEvents(batch, events, renew);
                const r = await this.states.updateOne({ _id: scope, owner, version: state.version, lockUntil: { $gt: new Date() } },
                    { $set: { version, head: batch, policy: snapshot.policy } });
                if (r.modifiedCount !== 1) throw new Error('实时批次未发布');
                await this.batches.updateOne({ _id: batch }, { $set: { committed: true } });
                state = { ...state, version, head: batch, policy: snapshot.policy };
                this.cache.set(scope, { version, objects: new Map(snapshot.objects.map((o) => [feedKey(o), o])) });
            }
            return { snapshot, state };
        } finally {
            await this.states.updateOne({ _id: scope, owner }, { $unset: { owner: '' }, $set: { lockUntil: new Date(0) } });
        }
    }

    async checkpoint(scope: string, published: { snapshot: Snapshot, state: any }): Promise<LiveCursor> {
        const reusable = await this.batches.findOne({ scope, kind: 'checkpoint', version: published.state.version,
            policy: published.snapshot.policy, ready: true });
        if (reusable) return { kind: 's', id: reusable._id, version: published.state.version, index: -1 };
        const id = randomBytes(12).toString('hex');
        await this.batches.insertOne({ _id: id, scope, kind: 'checkpoint', version: published.state.version,
            policy: published.snapshot.policy, count: published.snapshot.objects.length, ready: false, createdAt: new Date() });
        await this.writeEvents(id, published.snapshot.objects);
        await this.batches.updateOne({ _id: id }, { $set: { ready: true } });
        return { kind: 's', id, version: published.state.version, index: -1 };
    }

    token(scope: string, cursor: LiveCursor) {
        const prefix = feedHash(scope).slice(0, 16);
        return `${prefix}-${cursor.kind}${cursor.id}-${cursor.index}`;
    }

    async resume(scope: string, token: string, current: { snapshot: Snapshot, state: any }): Promise<LiveCursor> {
        const match = /^([a-f0-9]{16})-([sd])([a-f0-9]{24}|[1-9][0-9]{0,12})-([0-9]{1,9})$/.exec(token);
        if (!match || match[1] !== feedHash(scope).slice(0, 16)) throw new InvalidFeedToken('无效的事件令牌');
        const kind = match[2] as 's' | 'd';
        const id = match[3];
        const index = Number(match[4]);
        if ((kind === 's' && !/^[a-f0-9]{24}$/.test(id)) || (kind === 'd' && !/^[1-9][0-9]{0,12}$/.test(id))) throw new InvalidFeedToken('无效的事件令牌');
        const batch = kind === 's'
            ? await this.batches.findOne({ _id: id, scope, kind: 'checkpoint', ready: true })
            : (await this.visible(scope, current.state, Number(id))).find((b) => b.version === Number(id));
        if (!batch || (kind === 'd' && !Number.isSafeInteger(Number(id))) || batch.policy !== current.snapshot.policy
            || index >= batch.count || batch.version > current.state.version) throw new InvalidFeedToken('比赛状态已更新，请重新连接');
        return { kind, id, version: batch.version, index };
    }

    async read(scope: string, cursor: LiveCursor, state: any, limit = 250) {
        const output: { event: FeedObject, cursor: LiveCursor }[] = [];
        let position = { ...cursor };
        if (position.kind === 's') {
            const batch = await this.batches.findOne({ _id: position.id, scope, kind: 'checkpoint', ready: true });
            if (!batch) throw new InvalidFeedToken('事件快照不存在');
            const rows = await this.events.find({ batch: batch._id, index: { $gt: position.index } }).sort({ index: 1 }).limit(limit).toArray();
            for (const row of rows) {
                position = { ...position, index: row.index };
                output.push({ event: row.event, cursor: { ...position } });
            }
            if (position.index + 1 < batch.count || output.length >= limit) return output;
            position = { kind: 'd', id: String(batch.version), version: batch.version, index: Number.MAX_SAFE_INTEGER };
        }
        const batches = await this.visible(scope, state, position.version);
        for (const batch of batches) {
            const rows = await this.events.find({ batch: batch._id,
                ...(batch.version === position.version ? { index: { $gt: position.index } } : {}) })
                .sort({ index: 1 }).limit(limit - output.length).toArray();
            for (const row of rows) {
                position = { kind: 'd', id: String(batch.version), version: batch.version, index: row.index };
                output.push({ event: row.event, cursor: { ...position } });
            }
            if (output.length >= limit) break;
        }
        return output;
    }
}
