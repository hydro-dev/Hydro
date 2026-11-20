import type { Document } from 'mongodb';
import { PRIV } from '@hydrooj/common';
import type { MongoService } from '../service/db';

type RankingDb = Pick<MongoService, 'collection'>;

export const EXTERNAL_RANKING_PLATFORMS = [
    { key: 'codeforces', label: 'Codeforces' },
    { key: 'atcoder', label: 'AtCoder' },
    { key: 'nowcoder', label: '牛客' },
    { key: 'luogu', label: '洛谷' },
    { key: 'leetcode', label: '力扣' },
] as const;
type Platform = typeof EXTERNAL_RANKING_PLATFORMS[number]['key'];
type ExternalRankingSort = Platform | 'total';

interface RpRow {
    uid: number;
    rank: number;
}

interface Snapshot {
    platform: Platform;
    total: number;
    lastSuccessAt: Date;
    failedAt?: Date;
}

interface ExternalRow {
    uid: number;
    uname: string;
    snapshots: Snapshot[];
    total: number | null;
}

interface BoardResult<T> {
    rows: T[];
    counts: { count: number }[];
    viewer?: { rank: number }[];
}

const MEMBER = { uid: { $gt: 1 }, join: true } as const;
// Same class format as validateStudentInfo; MongoDB PCRE uses \z for strict end of input.
const CLASS_COHORT = '^[\u4E00-\u9FA5]{2,4}([12][0-9])[0-9]{2}\\z';
const STALE_AFTER_MS = 36 * 60 * 60 * 1000; // Daily refresh plus time for jobs to finish.

function withCohort(db: RankingDb): Document[] {
    // MongoDB 5.0 can still use FCV 4.4; keep equality lookups separate from pipeline lookups.
    return [
        {
            $lookup: {
                from: db.collection('stu.info').collectionName,
                localField: 'uid',
                foreignField: '_id',
                as: 'student',
            },
        },
        {
            $set: {
                cohort: {
                    $let: {
                        vars: { className: { $arrayElemAt: ['$student.class', 0] } },
                        in: {
                            $cond: [
                                { $eq: [{ $type: '$$className' }, 'string'] },
                                {
                                    $let: {
                                        vars: { match: { $regexFind: { input: '$$className', regex: CLASS_COHORT } } },
                                        in: { $ifNull: [{ $arrayElemAt: ['$$match.captures', 0] }, 'unknown'] },
                                    },
                                },
                                'unknown',
                            ],
                        },
                    },
                },
            },
        },
        { $unset: 'student' },
    ];
}

function gradeFilter(db: RankingDb, grade: string): Document[] {
    if (grade === 'all') return [];
    return [...withCohort(db), { $match: { cohort: grade } }, { $unset: 'cohort' }];
}

function paging(page: number, pageSize: number): Document[] {
    return [{ $skip: Math.min((page - 1) * pageSize, Number.MAX_SAFE_INTEGER) }, { $limit: pageSize }];
}

export async function getGradeOptions(db: RankingDb, domainId: string) {
    const rows = await db.collection('domain.user').aggregate<{ _id: string }>([
        { $match: { domainId, ...MEMBER } },
        ...withCohort(db),
        { $match: { cohort: { $ne: 'unknown' } } },
        { $group: { _id: '$cohort' } },
        { $sort: { _id: 1 } },
    ]).toArray();
    return rows.map(({ _id }) => _id);
}

export async function getGradeRpRanking(db: RankingDb, domainId: string, grade: string, page: number, pageSize: number, viewerUid?: number) {
    const sort = { rp: -1, uid: 1 };
    const [result] = await db.collection('domain.user').aggregate<BoardResult<{ uid: number }>>([
        { $match: { domainId, ...MEMBER, rp: { $gt: 0 } } },
        ...gradeFilter(db, grade),
        { $project: { _id: 0, uid: 1, rp: 1 } },
        {
            $facet: {
                rows: [{ $sort: sort }, ...paging(page, pageSize), { $project: { uid: 1 } }],
                counts: [{ $count: 'count' }],
                ...(viewerUid > 1 ? {
                    viewer: [
                        {
                            $setWindowFields: {
                                sortBy: sort,
                                output: { rank: { $sum: 1, window: { documents: ['unbounded', 'current'] } } },
                            },
                        },
                        { $match: { uid: viewerUid } },
                        { $project: { rank: 1 } },
                    ],
                } : {}),
            },
        },
    ]).toArray();
    return {
        rows: result.rows.map(({ uid }, i): RpRow => ({ uid, rank: (page - 1) * pageSize + i + 1 })),
        count: result.counts[0]?.count || 0,
        viewerRank: result.viewer?.[0]?.rank,
    };
}

export async function getExternalRanking(
    db: RankingDb, domainId: string, grade: string, page: number, pageSize: number,
    sort: ExternalRankingSort = 'total', now = new Date(), scope: 'all' | 'synced' = 'all',
) {
    const sortRows: Document[] = sort === 'total' ? [{ $sort: { total: -1, uid: 1 } }] : [
        {
            $set: {
                platformTotal: {
                    $let: {
                        vars: {
                            selected: {
                                $filter: { input: '$snapshots', cond: { $eq: ['$$this.platform', sort] } },
                            },
                        },
                        in: { $ifNull: [{ $arrayElemAt: ['$$selected.total', 0] }, null] },
                    },
                },
            },
        },
        { $sort: { platformTotal: -1, uid: 1 } },
    ];
    const [result] = await db.collection('domain.user').aggregate<{
        rows: ExternalRow[];
        counts: { all: number, synced: number }[];
    }>([
        { $match: { domainId, ...MEMBER } },
        ...gradeFilter(db, grade),
        {
            $lookup: {
                from: db.collection('user').collectionName,
                let: { uid: '$uid' },
                pipeline: [
                    { $match: { $expr: { $eq: ['$_id', '$$uid'] }, priv: { $bitsAllSet: PRIV.PRIV_USER_PROFILE } } },
                    { $project: { _id: 0, uname: 1 } },
                ],
                as: 'account',
            },
        },
        { $match: { 'account.0': { $exists: true } } },
        {
            $lookup: {
                from: db.collection('external.oj.binding').collectionName,
                let: { uid: '$uid' },
                pipeline: [
                    {
                        $match: {
                            platform: { $in: EXTERNAL_RANKING_PLATFORMS.map(({ key }) => key) },
                            total: { $gte: 0, $lte: Number.MAX_SAFE_INTEGER },
                            $expr: {
                                $and: [
                                    { $eq: ['$uid', '$$uid'] },
                                    {
                                        $cond: [
                                            { $isNumber: '$total' },
                                            { $eq: ['$total', { $trunc: '$total' }] },
                                            false,
                                        ],
                                    },
                                    { $eq: [{ $type: '$lastSuccessAt' }, 'date'] },
                                ],
                            },
                        },
                    },
                    {
                        $project: {
                            _id: 0, platform: 1, total: 1, lastSuccessAt: 1, failedAt: 1,
                        },
                    },
                ],
                as: 'snapshots',
            },
        },
        {
            $project: {
                _id: 0,
                uid: 1,
                uname: { $arrayElemAt: ['$account.uname', 0] },
                snapshots: 1,
                total: { $cond: [{ $size: '$snapshots' }, { $sum: '$snapshots.total' }, null] },
            },
        },
        {
            $facet: {
                rows: [
                    ...(scope === 'synced' ? [{ $match: { total: { $ne: null } } }] : []),
                    ...sortRows, ...paging(page, pageSize),
                ],
                counts: [{
                    $group: {
                        _id: null,
                        all: { $sum: 1 },
                        synced: { $sum: { $cond: [{ $ne: ['$total', null] }, 1, 0] } },
                    },
                }],
            },
        },
    ]).toArray();
    const rows = result.rows.map(({ uid, uname, total, snapshots }, i) => {
        const platforms = Object.fromEntries(snapshots.map((snapshot) => [snapshot.platform, {
            total: snapshot.total,
            stale: snapshot.failedAt > snapshot.lastSuccessAt
                || now.getTime() - snapshot.lastSuccessAt.getTime() > STALE_AFTER_MS,
        }]));
        return {
            uid,
            uname,
            total,
            rank: (page - 1) * pageSize + i + 1,
            platforms,
        };
    });
    const { all: allCount, synced: syncedCount } = result.counts[0] || { all: 0, synced: 0 };
    return { rows, count: scope === 'synced' ? syncedCount : allCount, allCount, syncedCount };
}

export async function getUserExternalSnapshots(db: RankingDb, uids: number[], now = new Date()) {
    const snapshots = await db.collection('external.oj.binding').aggregate<Snapshot & { uid: number }>([
        {
            $match: {
                uid: { $in: [...new Set(uids)] },
                platform: { $in: EXTERNAL_RANKING_PLATFORMS.map(({ key }) => key) },
                total: { $gte: 0, $lte: Number.MAX_SAFE_INTEGER },
                $expr: {
                    $and: [
                        { $cond: [{ $isNumber: '$total' }, { $eq: ['$total', { $trunc: '$total' }] }, false] },
                        { $eq: [{ $type: '$lastSuccessAt' }, 'date'] },
                    ],
                },
            },
        },
        { $project: { _id: 0, uid: 1, platform: 1, total: 1, lastSuccessAt: 1, failedAt: 1 } },
    ]).toArray();
    return Object.fromEntries(uids.map((uid) => {
        const entries = snapshots.filter((snapshot) => snapshot.uid === uid);
        return [uid, {
            platforms: Object.fromEntries(entries.map((snapshot) => [snapshot.platform, {
                total: snapshot.total,
                stale: snapshot.failedAt > snapshot.lastSuccessAt
                    || now.getTime() - snapshot.lastSuccessAt.getTime() > STALE_AFTER_MS,
            }])),
            total: entries.length ? entries.reduce((sum, snapshot) => sum + snapshot.total, 0) : null,
        }];
    }));
}

export async function getDailyExternalRanking(
    db: RankingDb, domainId: string, grade: string, page: number, pageSize: number, round: Date,
    options: { uids?: number[], scope?: 'all' | 'synced' } = {},
) {
    const [result] = await db.collection('domain.user').aggregate<{
        rows: { uid: number, total: number | null, partial: boolean }[];
        counts: { count: number }[];
        ready: { count: number }[];
    }>([
        { $match: { domainId, ...MEMBER } },
        ...(options.uids ? [{ $match: { uid: { $in: options.uids } } }] : []),
        ...gradeFilter(db, grade),
        {
            $lookup: {
                from: db.collection('user').collectionName,
                let: { uid: '$uid' },
                pipeline: [
                    { $match: { $expr: { $eq: ['$_id', '$$uid'] }, priv: { $bitsAllSet: PRIV.PRIV_USER_PROFILE } } },
                    { $project: { _id: 1 } },
                ],
                as: 'account',
            },
        },
        { $match: { 'account.0': { $exists: true } } },
        {
            $lookup: {
                from: db.collection('external.oj.binding').collectionName,
                let: { uid: '$uid' },
                pipeline: [
                    {
                        $match: {
                            platform: { $in: EXTERNAL_RANKING_PLATFORMS.map(({ key }) => key) },
                            $expr: { $eq: ['$uid', '$$uid'] },
                        },
                    },
                    {
                        $project: {
                            _id: 0,
                            increment: {
                                $cond: [
                                    {
                                        $and: [
                                            { $eq: ['$dailySnapshot.round', round] },
                                            { $eq: [{ $type: '$lastSuccessAt' }, 'date'] },
                                            { $lte: [{ $ifNull: ['$failedAt', new Date(0)] }, '$lastSuccessAt'] },
                                            {
                                                $cond: [
                                                    { $isNumber: '$dailySnapshot.increment' },
                                                    {
                                                        $and: [
                                                            { $gte: ['$dailySnapshot.increment', 0] },
                                                            { $lte: ['$dailySnapshot.increment', Number.MAX_SAFE_INTEGER] },
                                                            { $eq: ['$dailySnapshot.increment', { $trunc: '$dailySnapshot.increment' }] },
                                                        ],
                                                    },
                                                    false,
                                                ],
                                            },
                                        ],
                                    },
                                    '$dailySnapshot.increment',
                                    null,
                                ],
                            },
                        },
                    },
                ],
                as: 'dailyBindings',
            },
        },
        { $set: { increments: { $filter: { input: '$dailyBindings', cond: { $ne: ['$$this.increment', null] } } } } },
        {
            $project: {
                _id: 0, uid: 1,
                total: { $cond: [{ $size: '$increments' }, { $sum: '$increments.increment' }, null] },
                partial: { $gt: [{ $size: '$dailyBindings' }, { $size: '$increments' }] },
            },
        },
        {
            $facet: {
                rows: [
                    ...(options.scope === 'synced' ? [{ $match: { total: { $ne: null } } }] : []),
                    { $sort: { total: -1, uid: 1 } }, ...paging(page, pageSize),
                ],
                counts: [{ $count: 'count' }],
                ready: [{ $match: { total: { $ne: null } } }, { $count: 'count' }],
            },
        },
    ]).toArray();
    const allCount = result.counts[0]?.count || 0;
    const syncedCount = result.ready[0]?.count || 0;
    return {
        allCount,
        syncedCount,
        rows: result.rows.map((row, i) => ({ ...row, rank: (page - 1) * pageSize + i + 1 })),
        count: options.scope === 'synced' ? syncedCount : allCount,
        ready: !!syncedCount,
    };
}
