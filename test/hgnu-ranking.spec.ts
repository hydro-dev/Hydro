import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Db, MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { after, before, test } from 'node:test';
import nunjucks from 'nunjucks';
import { PRIV } from '@hydrooj/common';
import {
    EXTERNAL_RANKING_PLATFORMS, getExternalRanking, getGradeOptions, getGradeRpRanking,
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

test('ranking template renders sortable headers, distinguishes zero from missing, and keeps each pager state', () => {
    class RankingLoader extends nunjucks.FileSystemLoader {
        getSource(name: string) {
            if (name === 'layout/basic.html') return { src: '{% block content %}{% endblock %}', path: name, noCache: true };
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
        datetimeSpan: () => 'old timestamp',
        handler: { user: { hasPriv: () => false } },
        // eslint-disable-next-line ts/naming-convention -- Matches the template macro name.
        user: { render_inline: (doc) => doc?.name ? `${doc.class} ${doc.name}` : (doc?.uname || 'member') },
        PRIV,
        model: { rp: {} },
        grade: '22',
        grades: ['22', '23'],
        page: 3,
        upcount: 4,
        udocs: [{ rp: 1 }],
        rpRanks: [3],
        externalPage: 2,
        externalPageCount: 3,
        externalSort,
        externalScope: 'synced',
        externalAllCount: 16,
        externalSyncedCount: 5,
        externalPlatforms: EXTERNAL_RANKING_PLATFORMS,
        externalUsers: { 7: { class: '计算机2201', name: '排序甲' }, 6: { uname: 'missing' } },
        externalRows: [
            { uid: 7, rank: 3, uname: 'zero', total: 0, platforms: { leetcode: { total: 0, stale: false } } },
            { uid: 6, rank: 4, uname: 'missing', total: null, platforms: {} },
        ],
    });
    const html = render('luogu');
    const [rp, external] = html.split('id="external-ranking"');
    const headers = [...external.matchAll(/<th\b([^>]*)>([\s\S]*?)<\/th>/g)];
    const metrics = ['codeforces', 'atcoder', 'nowcoder', 'luogu', 'leetcode', 'total'];
    const labels = ['Codeforces', 'AtCoder', '牛客', '洛谷', '力扣', '合计'];
    assert.equal(headers.length, 8);
    for (const [i, [, attrs, content]] of headers.slice(2).entries()) {
        assert.match(content, new RegExp(`>${labels[i]}(?:\\s|<)`));
        const link = new URL(content.match(/href="([^"]+)"/)[1].replaceAll('&amp;', '&'), 'http://ranking.test');
        assert.equal(link.hash, '#external-ranking');
        assert.deepEqual(Object.fromEntries(link.searchParams), {
            grade: '22', page: '3', externalSort: metrics[i], externalScope: 'synced',
        });
        assert.equal(attrs.includes('aria-sort="descending"'), metrics[i] === 'luogu');
    }
    assert.match(external, /<td>\s*0\s*<\/td>\s*<td>\s*<strong>0<\/strong>/);
    assert.match(external, /<td>\s*—\s*<\/td>\s*<td>\s*<strong>—<\/strong>/);
    assert.match(external, /计算机2201 排序甲/);
    assert.match(external, /全部成员（16）/);
    assert.match(external, /仅已同步（5）/);
    assert.doesNotMatch(external, /同步时间|old timestamp/);

    const hrefs = (section: string) => [...section.matchAll(/href="([^"]+)"/g)]
        .map(([, href]) => new URL(href.replaceAll('&amp;', '&'), 'http://ranking.test'));
    const hasLink = (section: string, params: Record<string, string>, hash = '') => {
        assert(hrefs(section).some((link) => link.hash === hash
            && link.searchParams.size === Object.keys(params).length
            && Object.entries(params).every(([key, value]) => link.searchParams.get(key) === value)));
    };
    hasLink(rp, {
        page: '4', grade: '22', externalPage: '2', externalSort: 'luogu', externalScope: 'synced',
    });
    hasLink(external, {
        page: '3', grade: '22', externalPage: '3', externalSort: 'luogu', externalScope: 'synced',
    }, '#external-ranking');
    hasLink(rp, { externalSort: 'luogu', externalScope: 'synced' });
    hasLink(rp, { grade: '23', externalSort: 'luogu', externalScope: 'synced' });
    hasLink(rp, { grade: 'unknown', externalSort: 'luogu', externalScope: 'synced' });
    assert.match(render('total'), /aria-sort="descending">\s*<a[^>]*externalSort=total/);
});
