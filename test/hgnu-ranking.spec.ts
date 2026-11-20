import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Db, MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { after, before, test } from 'node:test';
import nunjucks from 'nunjucks';
import { PRIV } from '@hydrooj/common';
import {
    EXTERNAL_RANKING_PLATFORMS, getDailyExternalRanking, getExternalRanking, getGradeOptions, getGradeRpRanking,
} from '../packages/hydrooj/src/model/ranking';
import type { Collections } from '../packages/hydrooj/src/service/db';

let mongo: MongoMemoryServer;
let client: MongoClient;
let db: Db;

const rankingDb = {
    collection<K extends keyof Collections>(name: K) {
        // Custom physical names ensure each lookup honors the collection mapping.
        return db.collection<Collections[K]>(`ranking.test.${name}`);
    },
};
const bindings = () => db.collection('ranking.test.external.oj.binding');
const now = new Date('2026-11-18T09:00:00Z');
const recent = new Date('2026-11-18T04:00:00Z');
const older = new Date('2026-11-16T04:00:00Z');
const failure = new Date('2026-11-18T06:00:00Z');

before(async () => {
    const localMongo = process.env.HGNUOJ_TEST_MONGO_URI;
    if (!localMongo) mongo = await MongoMemoryServer.create();
    client = await MongoClient.connect(localMongo || mongo.getUri());
    if (process.env.HGNUOJ_TEST_MONGO_FCV) {
        const { featureCompatibilityVersion } = await client.db('admin').command({
            getParameter: 1, featureCompatibilityVersion: 1,
        });
        assert.equal(featureCompatibilityVersion.version, process.env.HGNUOJ_TEST_MONGO_FCV);
    }
    db = client.db(`hgnuoj_ranking_test_${randomUUID().replace(/-/g, '')}`);
    await Promise.all([
        rankingDb.collection('domain.user').insertMany([
            { uid: 2, rp: 300, domainId: 'local', join: true },
            { uid: 3, rp: 250, domainId: 'local', join: true },
            { uid: 4, rp: 200, domainId: 'local', join: true },
            { uid: 5, rp: 200, domainId: 'local', join: true },
            { uid: 6, rp: 200, domainId: 'local', join: true },
            { uid: 7, rp: 190, domainId: 'local', join: true },
            { uid: 8, rp: 999, domainId: 'local', join: false },
            { uid: 9, rp: 999, domainId: 'another', join: true },
            { uid: 10, rp: 130, domainId: 'local', join: true },
            { uid: 11, rp: 0, domainId: 'local', join: true },
            { uid: 12, rp: 150, domainId: 'local', join: true },
            { uid: 13, rp: 150, domainId: 'local', join: true },
            { uid: 14, rp: 150, domainId: 'local', join: true },
            { uid: 15, rp: 150, domainId: 'local', join: true },
            { uid: 16, rp: 0, domainId: 'local', join: true },
            { uid: 1, rp: 0, domainId: 'local', join: true },
        ]),
        rankingDb.collection('stu.info').insertMany([
            { _id: 2, class: '计算机2301' },
            { _id: 3, class: '计算机2201' },
            { _id: 4, class: '软件2302' },
            { _id: 5, class: '软件2202' },
            { _id: 6, class: '计算机2203' },
            { _id: 7, class: '软件2203' },
            { _id: 8, class: '软件2601' },
            { _id: 9, class: '软件2501' },
            { _id: 10, class: '软件2201\n' },
            { _id: 11, class: '软件2401' },
            { _id: 14, class: '软件1801' },
            { _id: 15, class: '软件2901' },
        ]),
        db.collection<{ _id: number, uname: string, priv: number }>('ranking.test.user').insertMany(
            Array.from({ length: 15 }, (_, i) => i + 1).map((uid) => ({
                _id: uid, uname: `member-${uid}`, priv: uid === 13 ? 0 : PRIV.PRIV_USER_PROFILE,
            })),
        ),
        bindings().createIndex({ uid: 1, platform: 1 }, { unique: true }),
        bindings().insertMany([
            { uid: 2, platform: 'atcoder', total: 100, lastSuccessAt: recent },
            { uid: 3, platform: 'codeforces', total: 7, lastSuccessAt: recent },
            { uid: 3, platform: 'atcoder', total: 3, lastSuccessAt: older },
            { uid: 3, platform: 'luogu', failedAt: failure },
            { uid: 5, platform: 'nowcoder', total: 10, lastSuccessAt: recent, failedAt: failure },
            { uid: 5, platform: 'luogu', total: 0, lastSuccessAt: recent },
            { uid: 6, platform: 'atcoder', total: 99, failedAt: failure },
            { uid: 6, platform: 'codeforces', total: [99], lastSuccessAt: recent },
            { uid: 6, platform: 'nowcoder', total: 1.5, lastSuccessAt: recent },
            { uid: 7, platform: 'leetcode', total: 0, lastSuccessAt: recent, failedAt: older },
            { uid: 8, platform: 'leetcode', total: 999, lastSuccessAt: recent },
            { uid: 9, platform: 'leetcode', total: 999, lastSuccessAt: recent },
            { uid: 10, platform: 'leetcode', total: 2, lastSuccessAt: recent },
            { uid: 11, platform: 'leetcode', total: 1, lastSuccessAt: recent },
            { uid: 12, platform: 'leetcode', total: 4, lastSuccessAt: recent },
            { uid: 13, platform: 'leetcode', total: 999, lastSuccessAt: recent },
            { uid: 15, platform: 'leetcode', total: 999, lastSuccessAt: recent },
            { uid: 16, platform: 'leetcode', total: 999, lastSuccessAt: recent },
            { uid: 1, platform: 'leetcode', total: 999, lastSuccessAt: recent },
        ]),
    ]);
});

after(async () => {
    try {
        if (db && /^hgnuoj_ranking_test_[a-f0-9]{32}$/.test(db.databaseName)) await db.dropDatabase();
    } finally {
        try {
            await client?.close();
        } finally {
            await mongo?.stop();
        }
    }
});

test('official cohorts are discovered within the domain and RP is ranked before paging', async () => {
    assert.deepEqual(await getGradeOptions(rankingDb, 'local'), ['18', '22', '23', '24', '29']);
    const first = await getGradeRpRanking(rankingDb, 'local', '22', 1, 2, 6);
    const second = await getGradeRpRanking(rankingDb, 'local', '22', 2, 2, 6);
    assert.equal(second.count, 4);
    assert.deepEqual(first.rows.concat(second.rows).map(({ uid, rank }) => [uid, rank]), [[3, 1], [5, 2], [6, 3], [7, 4]]);
    assert.equal(first.viewerRank, 3);
    assert.equal(second.viewerRank, 3);

    const unknown = await getGradeRpRanking(rankingDb, 'local', 'unknown', 1, 10, 3);
    assert.deepEqual(unknown.rows.map(({ uid }) => uid), [12, 13, 10]);
    assert.equal(unknown.viewerRank, undefined);
    assert.deepEqual(await getGradeRpRanking(rankingDb, 'local', '24', 1, 2), {
        rows: [], count: 0, viewerRank: undefined,
    });
});

test('synced scope ranks only users with known counts, including zero', async () => {
    const board = await getExternalRanking(rankingDb, 'local', '22', 2, 2, 'total', now, 'synced');
    assert.equal(board.allCount, 4);
    assert.equal(board.syncedCount, 3);
    assert.equal(board.count, 3);
    assert.deepEqual(board.rows.map(({ uid, rank, total }) => [uid, rank, total]), [[7, 3, 0]]);
    const empty = await getExternalRanking(rankingDb, 'local', '18', 1, 2, 'total', now, 'synced');
    assert.deepEqual({ ...empty }, { count: 0, allCount: 1, syncedCount: 0, rows: [] });
});

test('external ranking sums valid snapshots across all eligible members before paging', async () => {
    const all = await getExternalRanking(rankingDb, 'local', 'all', 1, 20);
    assert.equal(all.count, 11);
    assert.deepEqual(all.rows.map(({ uid }) => uid), [15, 2, 3, 5, 12, 10, 11, 7, 4, 6, 14]);

    const first = await getExternalRanking(rankingDb, 'local', '22', 1, 2, 'total', now);
    const second = await getExternalRanking(rankingDb, 'local', '22', 2, 2, 'total', now);
    assert.equal(first.count, 4);
    assert.deepEqual(first.rows.concat(second.rows).map(({ uid, total, rank }) => [uid, total, rank]), [
        [3, 10, 1], [5, 10, 2], [7, 0, 3], [6, null, 4],
    ]);
    assert.equal(first.rows[0].uname, 'member-3');
    assert.equal(first.rows[0].platforms.atcoder.stale, true);
    assert.equal(first.rows[0].platforms.luogu, undefined);
    assert.equal(first.rows[1].platforms.luogu.total, 0);
    assert.equal(first.rows[1].platforms.nowcoder.stale, true);
    assert.equal(second.rows[0].platforms.leetcode.stale, false);
    assert.deepEqual(second.rows[1].platforms, {});

    const unknown = await getExternalRanking(rankingDb, 'local', 'unknown', 1, 20, 'leetcode');
    const unboundOnly = await getExternalRanking(rankingDb, 'local', '18', 1, 20);
    assert.deepEqual(unknown.rows.map(({ uid }) => uid), [12, 10]);
    assert.deepEqual(unboundOnly.rows.map(({ uid, total }) => [uid, total]), [[14, null]]);

    await bindings().deleteOne({ uid: 3, platform: 'codeforces' });
    await bindings().replaceOne({ uid: 3, platform: 'atcoder' }, { uid: 3, platform: 'atcoder' });
    const afterChanges = await getExternalRanking(rankingDb, 'local', '22', 1, 10);
    assert.deepEqual(afterChanges.rows.map(({ uid }) => uid), [5, 7, 3, 6]);
});

test('each external metric sorts a full grade of 1,120 members before paging', async () => {
    const domainId = 'large';
    const uids = Array.from({ length: 1121 }, (_, i) => i + 2000);
    const firstGrade = uids.slice(0, -1);
    const topByMetric = {
        codeforces: 3115, atcoder: 3116, nowcoder: 3117, luogu: 3118, leetcode: 3119, total: 3119,
    } as const;
    await Promise.all([
        rankingDb.collection('domain.user').insertMany(uids.map((uid) => ({ uid, domainId, join: true, rp: 0 }))),
        rankingDb.collection('stu.info').insertMany(uids.map((uid) => ({
            _id: uid, class: uid === 3120 ? '计算机2301' : '计算机2201',
        }))),
        db.collection<{ _id: number, uname: string, priv: number }>('ranking.test.user').insertMany(uids.map((uid) => ({
            _id: uid, uname: `member-${uid}`, priv: PRIV.PRIV_USER_PROFILE,
        }))),
        bindings().insertMany([
            ...uids.slice(1, 1050).map((uid) => ({ uid, platform: 'atcoder', total: 1, lastSuccessAt: recent })),
            { uid: 2000, platform: 'codeforces', total: 0, lastSuccessAt: recent },
            { uid: 3115, platform: 'codeforces', total: 50, lastSuccessAt: recent },
            { uid: 3116, platform: 'atcoder', total: 55, lastSuccessAt: recent },
            { uid: 3117, platform: 'nowcoder', total: 60, lastSuccessAt: recent },
            { uid: 3118, platform: 'luogu', total: 65, lastSuccessAt: recent },
            { uid: 3119, platform: 'leetcode', total: 70, lastSuccessAt: recent },
            { uid: 3119, platform: 'codeforces', total: 50, lastSuccessAt: recent },
            { uid: 3120, platform: 'codeforces', total: 999, lastSuccessAt: recent },
        ]),
    ]);

    const defaultBoard = await getExternalRanking(rankingDb, domainId, '22', 1, 1);
    assert.equal(defaultBoard.count, firstGrade.length);
    assert.equal(defaultBoard.rows[0].uid, topByMetric.total);

    await Promise.all(Object.entries(topByMetric).map(async ([metric, uid]) => {
        const board = await getExternalRanking(rankingDb, domainId, '22', 1, 1, metric as keyof typeof topByMetric);
        assert.equal(board.count, firstGrade.length, metric);
        assert.deepEqual(board.rows.map((row) => [row.uid, row.rank]), [[uid, 1]], metric);
    }));
    const [first, second] = await Promise.all([
        getExternalRanking(rankingDb, domainId, '22', 1, 1000, 'codeforces'),
        getExternalRanking(rankingDb, domainId, '22', 2, 1000, 'codeforces'),
    ]);
    const leaders = [3115, 3119, 2000];
    const expected = [...leaders, ...firstGrade.filter((uid) => !leaders.includes(uid))];
    assert.deepEqual(first.rows.concat(second.rows).map(({ uid, rank }) => [uid, rank]), expected.map((uid, i) => [uid, i + 1]));
    assert.equal(second.rows[0].rank, 1001);
    assert.equal(second.rows.at(-1).rank, 1120);
});

test('one ranking table includes sortable daily practice without a separate board', () => {
    class RankingLoader extends nunjucks.FileSystemLoader {
        getSource(name: string) {
            if (name === 'layout/basic.html') {
                return { src: '{% block content %}{% endblock %}', path: name, noCache: true };
            }
            if (name === 'components/user.html') {
                return {
                    src: '{% macro render_inline(doc,avatar=true,badge=true,studentId=true) %}{{doc.class}} {{doc.name}}{% endmacro %}',
                    path: name, noCache: true,
                };
            }
            return super.getSource(name);
        }
    }
    const env = new nunjucks.Environment(new RankingLoader(join(__dirname, '../packages/ui-default/templates')), { autoescape: true });
    const render = (externalSort: string) => env.render('ranking.html', {
        _: (key: string) => key,
        url: (route: string, options?: { query?: Record<string, string> }) => (
            route === 'ranking' ? `/ranking?${new URLSearchParams(options?.query)}` : '/user'
        ),
        paginate: (page: number) => [['current', page], ['page', page + 1]],
        model: { rp: { problem: {}, contest: {}, hidden: { hidden: true } } },
        grade: '22', grades: ['22', '23'], page: 3, upcount: 4,
        externalSort, externalScope: 'synced', externalAllCount: 16, externalSyncedCount: 5,
        externalPlatforms: EXTERNAL_RANKING_PLATFORMS, dailyRound: '2026-11-20',
        mainRows: [
            { uid: 7, rank: 3, user: { class: '计算机2201', name: '排序甲', rp: 1, nAccept: 2 }, total: 0, platforms: { leetcode: { total: 0 } }, daily: { total: 5, partial: true } },
            { uid: 6, rank: 4, user: { name: 'confirmed-zero', rp: 0, nAccept: 0 }, total: null, platforms: {}, daily: { total: 0, partial: false } },
            { uid: 8, rank: 5, user: { name: 'pending-zero', rp: 0, nAccept: 0 }, total: null, platforms: {}, daily: { total: null, partial: false } },
        ],
    });
    const html = render('luogu');
    assert.equal([...html.matchAll(/<table\b/g)].length, 1);
    assert.equal([...html.matchAll(/<th\b/g)].length, 13);
    assert.doesNotMatch(html, /每日增量榜|id="daily-ranking"|dailyPage=|ranking-daily-table/);
    assert.match(html, />每日做题<\/a>/);
    assert.match(html, />其他<\/a>/);
    assert.doesNotMatch(html, /未知年级/);
    assert.match(html, /计算机2201 排序甲/);
    assert.match(html, /全部成员（16）/);
    assert.match(html, /仅已同步（5）/);
    const metrics = ['rp', 'codeforces', 'atcoder', 'nowcoder', 'luogu', 'leetcode', 'total', 'daily'];
    const sortLinks = [...html.matchAll(/class="typo-a ranking-sort-link"\s+href="([^"]+)"/g)]
        .map(([, href]) => new URL(href.replaceAll('&amp;', '&'), 'http://ranking.test'));
    assert.deepEqual(sortLinks.map((link) => link.searchParams.get('externalSort')), metrics);
    for (const link of sortLinks) {
        assert.equal(link.searchParams.get('page'), '1');
        assert.equal(link.searchParams.get('grade'), '22');
        assert.equal(link.searchParams.has('dailyPage'), false);
        assert.equal(link.hash, '#main-ranking');
    }
    assert.match(html, /5<span class="ranking-partial"/);
    assert.match(html, /confirmed-zero[\s\S]*?class="col--daily">\s*0\s*<\/td>/);
    assert.match(html, /<span class="ranking-pending"[^>]*title="[^"]*待更新[^"]*"[^>]*>0<\/span>/);
    assert.match(html, /21:00/);
    const pageLinks = [...html.matchAll(/href="([^"]+)"/g)]
        .map(([, href]) => new URL(href.replaceAll('&amp;', '&'), 'http://ranking.test'));
    assert.ok(pageLinks.some((link) => link.searchParams.get('page') === '4'
        && link.searchParams.get('grade') === '22' && !link.searchParams.has('dailyPage')
        && link.searchParams.get('externalSort') === 'luogu' && link.searchParams.get('externalScope') === 'synced'));
    assert.match(render('rp'), /aria-sort="descending">\s*<a[^>]*externalSort=rp/);
    assert.match(render('daily'), /aria-sort="descending">\s*<a[^>]*externalSort=daily/);
});

test('daily increments are scoped by grade, sorted before paging and distinguish missing from zero', async () => {
    const domainId = 'daily-fixture';
    const round = new Date('2026-11-18T13:00:00Z');
    const previous = new Date(+round - 86_400_000);
    const uids = Array.from({ length: 8 }, (_, i) => 4000 + i);
    await Promise.all([
        rankingDb.collection('domain.user').insertMany(uids.map((uid) => ({ uid, domainId, join: true, rp: 0 }))),
        rankingDb.collection('stu.info').insertMany(uids.map((uid) => ({ _id: uid, class: uid === 4005 ? '计算机2301' : '计算机2201' }))),
        db.collection<{ _id: number, uname: string, priv: number }>('ranking.test.user').insertMany(uids.map((uid) => ({
            _id: uid, uname: `daily-${uid}`, priv: uid === 4006 ? 0 : PRIV.PRIV_USER_PROFILE,
        }))),
        bindings().insertMany([
            { uid: 4000, platform: 'codeforces', lastSuccessAt: round, dailySnapshot: { round, total: 100, increment: 2 } },
            { uid: 4000, platform: 'atcoder', lastSuccessAt: round, dailySnapshot: { round, total: 70, increment: 3 } },
            { uid: 4001, platform: 'luogu', lastSuccessAt: round, dailySnapshot: { round, total: 10, increment: 0 } },
            { uid: 4002, platform: 'nowcoder', lastSuccessAt: round, dailySnapshot: { round, total: 20, increment: -1 } },
            { uid: 4003, platform: 'leetcode', lastSuccessAt: round, dailySnapshot: { round, total: 90, increment: null } },
            { uid: 4005, platform: 'codeforces', lastSuccessAt: round, dailySnapshot: { round, total: 999, increment: 999 } },
            { uid: 4006, platform: 'codeforces', lastSuccessAt: round, dailySnapshot: { round, total: 999, increment: 999 } },
            { uid: 4007, platform: 'codeforces', lastSuccessAt: round, dailySnapshot: { round, total: 90, increment: 4 } },
            { uid: 4007, platform: 'atcoder', lastSuccessAt: previous, dailySnapshot: { round: previous, total: 70, increment: 60 } },
        ]),
    ]);
    const first = await getDailyExternalRanking(rankingDb, domainId, '22', 1, 2, round);
    const second = await getDailyExternalRanking(rankingDb, domainId, '22', 2, 2, round);
    assert.equal(first.count, 6);
    assert.equal(first.ready, true);
    assert.deepEqual(first.rows.map(({ uid, total, rank }) => [uid, total, rank]), [[4000, 5, 1], [4007, 4, 2]]);
    assert.equal(first.rows[0].partial, false);
    assert.equal(first.rows[1].partial, true);
    assert.deepEqual(second.rows.map(({ uid, total, rank }) => [uid, total, rank]), [[4001, 0, 3], [4002, null, 4]]);
    const synced = await getDailyExternalRanking(rankingDb, domainId, '22', 1, 10, round, { scope: 'synced' });
    assert.equal(synced.count, 3);
    assert.equal(synced.allCount, 6);
    assert.equal(synced.syncedCount, 3);
    assert.deepEqual(synced.rows.map(({ uid }) => uid), [4000, 4007, 4001]);
    const visible = await getDailyExternalRanking(rankingDb, domainId, 'all', 1, 10, round, { uids: [4001, 4004] });
    assert.deepEqual(visible.rows.map(({ uid, total }) => [uid, total]), [[4001, 0], [4004, null]]);
    const tomorrow = await getDailyExternalRanking(rankingDb, domainId, '22', 1, 10, new Date(+round + 86_400_000));
    assert.equal(tomorrow.ready, false);
    assert.equal(tomorrow.count, 6);
    assert.deepEqual(tomorrow.rows.map(({ uid, total }) => [uid, total]), [4000, 4001, 4002, 4003, 4004, 4007].map((uid) => [uid, null]));
    const third = await getDailyExternalRanking(rankingDb, domainId, '22', 3, 2, round);
    assert.deepEqual(third.rows.map(({ uid, total, rank }) => [uid, total, rank]), [[4003, null, 5], [4004, null, 6]]);
    const noMembers = await getDailyExternalRanking(rankingDb, domainId, '24', 1, 10, round);
    assert.equal(noMembers.count, 0);
    assert.equal(noMembers.ready, false);
    assert.deepEqual(noMembers.rows, []);
    await bindings().deleteOne({ uid: 4000, platform: 'atcoder' });
    const unbound = await getDailyExternalRanking(rankingDb, domainId, '22', 1, 10, round);
    assert.equal(unbound.rows.find(({ uid }) => uid === 4000).total, 2);
});
