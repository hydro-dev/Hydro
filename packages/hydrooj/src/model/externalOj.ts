import { ObjectId } from 'mongodb';
import type { Context } from '../context';
import { ValidationError } from '../error';
import {
    EXTERNAL_PLATFORMS, externalAccountKey, externalOjHandle, ExternalOjHistoryLimit, ExternalOjRateLimit, ExternalPlatform, fetchExternalStats,
} from '../lib/externalOjs';
import {
    beijingDay, buildExternalDailySnapshot, ExternalDailySnapshot, externalSyncRound, FirstPass, firstPasses, nextBeijingSync, syncState,
} from '../lib/externalOjStats';
import db from '../service/db';

export interface ExternalOjBinding {
    _id: ObjectId;
    uid: number;
    platform: ExternalPlatform;
    handle: string;
    accountKey: string;
    revision: ObjectId;
    syncAfter: Date;
    leaseUntil?: Date;
    leaseToken?: ObjectId;
    lastSuccessAt?: Date;
    failedAt?: Date;
    total?: number;
    solves?: FirstPass[];
    olderSolved?: string[];
    cursorAt?: Date;
    dailySnapshot?: ExternalDailySnapshot;
}

declare module '../service/db' {
    interface Collections {
        'external.oj.binding': ExternalOjBinding;
        'external.oj.pause': {
            _id: ExternalPlatform; until?: Date; owner?: ObjectId; leaseUntil?: Date; nextLeaseAt?: Date;
        };
        'external.oj.quota': { _id: string, used: number, expireAt: Date };
    }
}

const coll = db.collection('external.oj.binding');
const pauses = db.collection('external.oj.pause');
const quotas = db.collection('external.oj.quota');
const HOUR = 60 * 60_000;
const QUEUE_LEASE_MS = 15 * 60_000; // Longer than one account's bounded sequence of requests.
const QUEUE_HANDOFF_MS = 2100; // Keep at least the strictest request interval between owners.
const DEFAULT_DAILY_REQUESTS = 2400;
export const EXTERNAL_OJ_LABELS: Record<ExternalPlatform, string> = {
    codeforces: 'Codeforces',
    atcoder: 'AtCoder',
    nowcoder: '牛客',
    luogu: '洛谷',
    leetcode: '力扣（中国站）',
};

export function externalPlatform(platform: string): ExternalPlatform {
    if (!EXTERNAL_PLATFORMS.includes(platform as ExternalPlatform)) throw new ValidationError('platform');
    return platform as ExternalPlatform;
}

export async function getExternalOjBindings(uid: number) {
    return coll.find({ uid }, { projection: { olderSolved: 0 } }).toArray();
}

export function describeExternalOjBindings(entries: ExternalOjBinding[], includeHandles = false) {
    return EXTERNAL_PLATFORMS.map((platform) => {
        const entry = entries.find((item) => item.platform === platform);
        return {
            platform,
            label: EXTERNAL_OJ_LABELS[platform],
            ...(includeHandles ? { handle: entry?.handle } : {}),
            state: syncState(entry),
            total: entry?.total,
            lastSuccessAt: entry?.lastSuccessAt,
            hasDaily: Array.isArray(entry?.solves),
        };
    });
}

export class ExternalOjBindingError extends Error {
    constructor(readonly reason: 'format' | 'taken' | 'changed') {
        super(reason);
    }
}

export async function bindExternalOj(uid: number, platform: ExternalPlatform, input: string) {
    let handle: string;
    let accountKey: string;
    try {
        handle = externalOjHandle(platform, input);
        accountKey = externalAccountKey(platform, handle);
    } catch {
        throw new ExternalOjBindingError('format');
    }
    const original = await coll.findOne({ uid, platform }, { projection: { accountKey: 1 } });
    if (original?.accountKey === accountKey) return;
    try {
        await coll.updateOne(
            { uid, platform },
            {
                $set: { handle, accountKey, revision: new ObjectId(), syncAfter: nextBeijingSync(new Date()) },
                $setOnInsert: { uid, platform },
                $unset: {
                    leaseUntil: '', leaseToken: '', total: '', solves: '', olderSolved: '', cursorAt: '',
                    lastSuccessAt: '', failedAt: '', dailySnapshot: '',
                },
            },
            { upsert: true },
        );
    } catch (error) {
        if (error?.code === 11000) {
            const owner = await coll.findOne({ platform, accountKey }, { projection: { uid: 1 } });
            if (owner?.uid === uid) return;
            throw new ExternalOjBindingError(owner ? 'taken' : 'changed');
        }
        throw error;
    }
}

export async function unbindExternalOj(uid: number, platform: ExternalPlatform) {
    await coll.deleteOne({ uid, platform });
}

export class ExternalOjBudgetExhausted extends Error {
    constructor() { super('External OJ daily request budget exhausted'); }
}

export async function claimExternalOjRequest(platform: ExternalPlatform, now: Date, limit: number) {
    // One request budget covers each Beijing calendar day.
    const id = `${platform}:${beijingDay(now)}`;
    try {
        await quotas.updateOne(
            { _id: id, used: { $lt: limit } },
            { $inc: { used: 1 }, $setOnInsert: { expireAt: new Date(now.getTime() + 72 * HOUR) } },
            { upsert: true },
        );
    } catch (error) {
        if (error?.code !== 11000) throw error;
        // First use of a new round may race another upsert. Increment the existing row
        // if there is still space; otherwise this request must not go to the provider.
        const claimed = await quotas.updateOne({ _id: id, used: { $lt: limit } }, { $inc: { used: 1 } });
        if (!claimed.matchedCount) throw new ExternalOjBudgetExhausted();
    }
}

export async function acquireExternalOjQueue(platform: ExternalPlatform, now: Date) {
    const owner = new ObjectId();
    try {
        await pauses.updateOne(
            {
                _id: platform,
                $and: [
                    { $or: [{ leaseUntil: { $lte: now } }, { leaseUntil: { $exists: false } }] },
                    { $or: [{ until: { $lte: now } }, { until: { $exists: false } }] },
                    { $or: [{ nextLeaseAt: { $lte: now } }, { nextLeaseAt: { $exists: false } }] },
                ],
            },
            { $set: { owner, leaseUntil: new Date(now.getTime() + QUEUE_LEASE_MS) } },
            { upsert: true },
        );
        return owner;
    } catch (error) {
        if (error?.code === 11000) return null;
        throw error;
    }
}

export async function releaseExternalOjQueue(platform: ExternalPlatform, owner: ObjectId, now = new Date()) {
    await pauses.updateOne({ _id: platform, owner }, {
        $set: { nextLeaseAt: new Date(now.getTime() + QUEUE_HANDOFF_MS) },
        $unset: { owner: '', leaseUntil: '' },
    });
}

function dueBindings(platform: ExternalPlatform, now: Date) {
    return {
        platform,
        syncAfter: { $lte: externalSyncRound(now) },
        $or: [{ leaseUntil: { $lte: now } }, { leaseUntil: { $exists: false } }],
    };
}

export interface ExternalOjSyncResult {
    status: 'success' | 'unbound' | 'cooldown' | 'paused' | 'budget' | 'busy' | 'failed';
    retryAfterSec?: number;
}

async function runExternalOjSync(
    binding: ExternalOjBinding,
    leaseToken: ObjectId,
    now: Date,
    fetchStats: typeof fetchExternalStats,
    limit: number,
    mode: 'scheduled' | 'manual',
): Promise<ExternalOjSyncResult> {
    const platform = binding.platform;
    const currentJob = { _id: binding._id, revision: binding.revision, leaseToken };
    const release = { leaseToken: '' as const, leaseUntil: '' as const };
    const started = Date.now();
    const completion = () => new Date(now.getTime() + (Date.now() - started));
    let result: Awaited<ReturnType<typeof fetchExternalStats>>;
    let solves: FirstPass[] | undefined;
    let olderSolved: string[] | undefined;
    try {
        result = await fetchStats(platform, binding.handle, binding, {
            now, beforeRequest: () => claimExternalOjRequest(platform, completion(), limit),
        });
        if (!Number.isSafeInteger(result.total) || result.total < 0) throw new Error('Invalid provider total');
        if (result.solves) {
            solves = firstPasses(result.solves);
            olderSolved = [...new Set(result.olderSolved || [])];
            const unique = new Set([...olderSolved, ...solves.map(({ problem }) => problem)]);
            if (unique.size !== result.total || unique.size > 100_000 || unique.size !== olderSolved.length + solves.length) {
                throw new Error('Invalid provider timeline');
            }
        }
    } catch (error) {
        const at = completion();
        if (error instanceof ExternalOjBudgetExhausted) {
            const until = nextBeijingSync(at);
            await pauses.updateOne({ _id: platform }, { $max: { until } }, { upsert: true });
            // Preserve the overdue date and its previous snapshot. It gets priority in the next round.
            await coll.updateOne(currentJob, { $unset: release });
            return { status: 'budget', retryAfterSec: Math.max(1, Math.ceil((until.getTime() - at.getTime()) / 1000)) };
        }
        let pausedRetrySec: number | undefined;
        if (error instanceof ExternalOjRateLimit) {
            await pauses.updateOne(
                { _id: platform },
                { $max: { until: new Date(at.getTime() + error.retryMs) } },
                { upsert: true },
            );
            pausedRetrySec = Math.max(1, Math.ceil(error.retryMs / 1000));
        }
        await coll.updateOne(currentJob, {
            $set: {
                failedAt: at,
                ...(mode === 'scheduled' ? {
                    syncAfter: nextBeijingSync(error instanceof ExternalOjHistoryLimit ? new Date(now.getTime() + 6 * 24 * HOUR) : now),
                } : {}),
            },
            $unset: release,
        });
        return pausedRetrySec ? { status: 'paused', retryAfterSec: pausedRetrySec } : { status: 'failed' };
    }
    const at = completion();
    await coll.updateOne(currentJob, {
        $set: {
            total: result.total,
            lastSuccessAt: at,
            ...(mode === 'scheduled' ? {
                dailySnapshot: buildExternalDailySnapshot(result.total, binding.dailySnapshot, now),
                syncAfter: nextBeijingSync(now),
            } : {}),
            ...(solves ? { solves, olderSolved, cursorAt: now } : {}),
        },
        $unset: {
            ...release,
            failedAt: '',
            ...(!solves ? { solves: '' as const, olderSolved: '' as const, cursorAt: '' as const } : {}),
        },
    });
    return { status: 'success' };
}

export async function syncDueExternalOj(
    platform: ExternalPlatform, now = new Date(), fetchStats = fetchExternalStats, limit = DEFAULT_DAILY_REQUESTS,
) {
    const pause = await pauses.findOne({ _id: platform });
    if (pause?.until > now) return false;
    const leaseToken = new ObjectId();
    const binding = await coll.findOneAndUpdate(
        dueBindings(platform, now),
        { $set: { leaseToken, leaseUntil: new Date(now.getTime() + 30 * 60_000) } },
        { sort: { syncAfter: 1, _id: 1 }, returnDocument: 'after' },
    );
    if (!binding) return false;
    const outcome = await runExternalOjSync(binding, leaseToken, now, fetchStats, limit, 'scheduled');
    return outcome.status !== 'budget';
}

export async function syncExternalOjBinding(
    uid: number,
    platform: ExternalPlatform,
    options: {
        now?: Date;
        cooldownMs?: number;
        fetchStats?: typeof fetchExternalStats;
        limit?: number;
    } = {},
): Promise<ExternalOjSyncResult> {
    const now = options.now ?? new Date();
    const cooldownMs = options.cooldownMs ?? 60_000;
    const fetchStats = options.fetchStats ?? fetchExternalStats;
    const limit = options.limit ?? DEFAULT_DAILY_REQUESTS;
    const existing = await coll.findOne({ uid, platform });
    if (!existing) return { status: 'unbound' };
    const pause = await pauses.findOne({ _id: platform });
    if (pause?.until > now) {
        return { status: 'paused', retryAfterSec: Math.max(1, Math.ceil((pause.until.getTime() - now.getTime()) / 1000)) };
    }
    if (cooldownMs > 0) {
        const lastAttempt = Math.max(existing.lastSuccessAt?.getTime() || 0, existing.failedAt?.getTime() || 0);
        if (lastAttempt && now.getTime() - lastAttempt < cooldownMs) {
            return { status: 'cooldown', retryAfterSec: Math.max(1, Math.ceil((lastAttempt + cooldownMs - now.getTime()) / 1000)) };
        }
    }
    const leaseToken = new ObjectId();
    const binding = await coll.findOneAndUpdate(
        {
            uid,
            platform,
            $or: [{ leaseUntil: { $lte: now } }, { leaseUntil: { $exists: false } }],
        },
        { $set: { leaseToken, leaseUntil: new Date(now.getTime() + 30 * 60_000) } },
        { returnDocument: 'after' },
    );
    if (!binding) {
        const latest = await coll.findOne({ uid, platform }, { projection: { _id: 1 } });
        return { status: latest ? 'busy' : 'unbound' };
    }
    return await runExternalOjSync(binding, leaseToken, now, fetchStats, limit, 'manual');
}

export async function apply(ctx: Context) {
    if (process.env.NODE_APP_INSTANCE !== '0') return;
    await db.ensureIndexes(
        coll,
        { key: { uid: 1, platform: 1 }, name: 'userPlatform', unique: true },
        { key: { platform: 1, accountKey: 1 }, name: 'platformAccount', unique: true },
        { key: { platform: 1, syncAfter: 1, _id: 1 }, name: 'dueBindings' },
    );
    if (process.env.CI || process.env.HGNUOJ_EXTERNAL_SYNC === '0') return;
    await db.ensureIndexes(quotas, { key: { expireAt: 1 }, name: 'expireQuota', expireAfterSeconds: 0 });
    const configuredLimit = Number(process.env.HGNUOJ_EXTERNAL_DAILY_REQUESTS);
    const limit = Number.isSafeInteger(configuredLimit) && configuredLimit > 0 && configuredLimit <= 10_000
        ? configuredLimit : DEFAULT_DAILY_REQUESTS;
    const active = new Set<ExternalPlatform>();
    const state = { disposed: false };
    const drain = async (platform: ExternalPlatform) => {
        const now = new Date();
        const current = await pauses.findOne({ _id: platform });
        if (current?.until > now || current?.leaseUntil > now || current?.nextLeaseAt > now) return;
        if (!await coll.findOne(dueBindings(platform, now), { projection: { _id: 1 } })) return;
        const owner = await acquireExternalOjQueue(platform, now);
        if (!owner) return;
        try {
            while (!state.disposed) {
                // eslint-disable-next-line no-await-in-loop
                if (!await syncDueExternalOj(platform, new Date(), fetchExternalStats, limit)) break;
                // eslint-disable-next-line no-await-in-loop
                const renewal = await pauses.updateOne(
                    { _id: platform, owner },
                    { $set: { leaseUntil: new Date(Date.now() + QUEUE_LEASE_MS) } },
                );
                if (!renewal.matchedCount) break;
            }
        } finally {
            await releaseExternalOjQueue(platform, owner);
        }
    };
    const tick = () => {
        for (const platform of EXTERNAL_PLATFORMS) {
            if (active.has(platform)) continue;
            active.add(platform);
            drain(platform).catch(() => ctx.logger.warn('External OJ queue failed: %s', platform))
                .finally(() => active.delete(platform));
        }
    };
    ctx.on('app/ready', () => {
        tick();
        const stop = ctx.interval(tick, 10_000);
        ctx.effect(() => () => {
            state.disposed = true;
            stop();
        });
    });
}
