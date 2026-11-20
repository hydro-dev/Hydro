import assert from 'node:assert/strict';
import { it, type TestContext } from 'node:test';
import {
    EXTERNAL_PLATFORMS, externalAccountKey, externalOjActivityUrl, ExternalOjHistoryLimit,
    externalOjProfileUrl, ExternalOjRateLimit, fetchExternalStats,
} from '../src/lib/externalOjs';

type Reply = (url: URL, init: RequestInit) => Response | Promise<Response>;

let now = 0;
function useFixtures(t: TestContext, reply: Reply) {
    const starts: { url: URL, time: number }[] = [];
    t.mock.method(performance, 'now', () => now);
    // Advance only the limiter's clock; HTTP and abort behavior are controlled by fixtures.
    t.mock.method(globalThis, 'setTimeout', (callback: () => void, delay: number) => {
        now += delay;
        queueMicrotask(callback);
    });
    t.mock.method(globalThis, 'fetch', (input: URL, init: RequestInit) => {
        const url = new URL(input);
        assert.equal(init.credentials, 'omit');
        assert.equal(init.redirect, 'error');
        assert.ok(init.signal);
        starts.push({ url, time: now });
        return reply(url, init);
    });
    return starts;
}

const ac = (id: number, seconds: number, index: string, verdict = 'OK') => ({
    id, creationTimeSeconds: seconds, verdict, testset: 'TESTS', problem: { contestId: 42, index },
});
const at = (id: number, seconds: number, problem: string, result = 'AC') => (
    { id, epoch_second: seconds, problem_id: problem, user_id: 'Alice', result }
);
const date = (seconds: number) => new Date(seconds * 1000);
const historical = { now: date(2_000_200) };
const historyNow = new Date('2026-11-18T16:00:00Z');
const windowStart = Date.parse('2025-11-19T16:00:00Z') / 1000;

it('normalizes only matching public profile URLs before applying account uniqueness', () => {
    assert.equal(externalAccountKey('codeforces', 'https://codeforces.com/profile/Alice'), 'codeforces:alice');
    assert.equal(externalAccountKey('atcoder', 'https://atcoder.jp/users/Alice?lang=ja'), 'atcoder:alice');
    assert.equal(externalAccountKey('nowcoder', 'https://ac.nowcoder.com/acm/contest/profile/00042/practice-coding'), 'nowcoder:42');
    assert.equal(externalAccountKey('luogu', 'https://www.luogu.com.cn/user/42'), 'luogu:42');
    assert.equal(externalAccountKey('leetcode', 'https://leetcode.cn/u/Alice/'), 'leetcode:alice');
    assert.throws(() => externalAccountKey('luogu', 'https://www.luogu.com.cn.evil.invalid/user/42'));
    assert.throws(() => externalAccountKey('leetcode', 'https://leetcode.com/u/Alice/'));
});

it('builds canonical HTTPS profile URLs from validated handles', () => {
    assert.equal(externalOjProfileUrl('codeforces', 'Tour.ist'), 'https://codeforces.com/profile/Tour.ist');
    assert.equal(externalOjProfileUrl('atcoder', 'http://atcoder.jp/users/Alice?lang=ja'), 'https://atcoder.jp/users/Alice');
    assert.equal(externalOjProfileUrl('nowcoder', '00042'), 'https://ac.nowcoder.com/acm/contest/profile/42/practice-coding');
    assert.equal(externalOjProfileUrl('luogu', '42'), 'https://www.luogu.com.cn/user/42');
    assert.equal(externalOjProfileUrl('leetcode', 'My-Slug'), 'https://leetcode.cn/u/My-Slug/');
    assert.throws(() => externalOjProfileUrl('codeforces', 'https://codeforces.com.evil.invalid/profile/Alice'));
    assert.throws(() => externalOjProfileUrl('codeforces', '..'));
});

it('builds a separate AtCoder Problems URL without changing the official profile', () => {
    assert.equal(externalOjActivityUrl('atcoder', 'https://atcoder.jp/users/tatyam'), 'https://kenkoooo.com/atcoder/#/user/tatyam');
    assert.equal(externalOjActivityUrl('codeforces', 'Alice'), undefined);
    assert.throws(() => externalOjActivityUrl('atcoder', 'not/a/handle'));
});

it('flags an upstream limit response with the provider retry delay', async (t) => {
    useFixtures(t, () => new Response('', { status: 429, headers: { 'Retry-After': '120' } }));
    await assert.rejects(fetchExternalStats('luogu', '42'), (error: unknown) => (
        error instanceof ExternalOjRateLimit && error.retryMs === 120_000
    ));
});

it('exports fixed platform order and normalizes account keys', () => {
    assert.deepEqual(EXTERNAL_PLATFORMS, ['codeforces', 'atcoder', 'nowcoder', 'luogu', 'leetcode']);
    assert.equal(externalAccountKey('codeforces', ' Tour.ist '), 'codeforces:tour.ist');
    assert.equal(externalAccountKey('atcoder', ' Foo_42 '), 'atcoder:foo_42');
    assert.equal(externalAccountKey('leetcode', ' My-Slug '), 'leetcode:my-slug');
    assert.equal(externalAccountKey('nowcoder', ' 00042 '), 'nowcoder:42');
    assert.equal(externalAccountKey('luogu', '0042'), 'luogu:42');
    for (const bad of ['https://example.com/u', '../foo', 'a?b', 'a b', '  ', 'ＡＬＩＣＥ']) {
        assert.throws(() => externalAccountKey('codeforces', bad));
    }
    for (const bad of ['a42', '0', '-42', '1e3', '9007199254740992']) {
        assert.throws(() => externalAccountKey('nowcoder', bad));
    }
});

it('Codeforces paginates with overlap and returns earliest AC per stable problem', async (t) => {
    const starts = useFixtures(t, (url) => {
        assert.equal(url.origin + url.pathname, 'https://codeforces.com/api/user.status');
        assert.equal(url.searchParams.get('handle'), 'alice');
        const size = Number(url.searchParams.get('count'));
        const from = Number(url.searchParams.get('from'));
        if (from !== 1) {
            assert.equal(from, size);
            return Response.json({
                status: 'OK',
                result: [
                    ac(10, 200, 'B', 'WRONG_ANSWER'), ac(9, 100, 'A'), ac(8, 70, 'A'),
                    { ...ac(7, 60, 'A'), testset: 'PRETESTS' },
                    { ...ac(6, 59, 'A'), verdict: undefined },
                ],
            });
        }
        return Response.json({
            status: 'OK',
            result: [
                ac(size + 9, 400, 'A'), ac(size + 8, 300, 'C'),
                ...Array.from({ length: size - 2 }, (_, i) => ac(size + 7 - i, 200, 'B', 'WRONG_ANSWER')),
            ],
        });
    });
    assert.deepEqual(await fetchExternalStats('codeforces', ' Alice ', undefined, historical), {
        total: 2, olderSolved: [], solves: [{ problem: '42:A', at: date(70) }, { problem: '42:C', at: date(300) }],
    });
    assert.equal(starts.length, 2);
    assert.ok(starts[1].time - starts[0].time >= 2000);
});

it('Codeforces rejects shifting offset pages', async (t) => {
    useFixtures(t, (url) => {
        const size = Number(url.searchParams.get('count'));
        return Response.json({
            status: 'OK',
            result: url.searchParams.get('from') === '1'
                ? Array.from({ length: size }, (_, i) => ac(size + 5 - i, 100, 'A'))
                : [ac(5, 99, 'B')],
        });
    });
    await assert.rejects(fetchExternalStats('codeforces', 'Alice'), /pagination/i);
});

it('AtCoder retains the boundary second and merges the last complete history', async (t) => {
    const lastSuccessAt = date(2_000_000);
    const prior = [{ problem: 'abc100_a', at: date(100) }, { problem: 'abc250_c', at: date(1_920_010) }];
    const previous = { lastSuccessAt, solves: prior };
    const begins: number[] = [];
    useFixtures(t, (url) => {
        assert.equal(url.origin + url.pathname, 'https://kenkoooo.com/atcoder/atcoder-api/v3/user/submissions');
        const from = Number(url.searchParams.get('from_second'));
        begins.push(from);
        assert.equal(url.searchParams.get('user'), 'alice');
        if (begins.length === 1) {
            assert.equal(from, 2_000_000 - 24 * 60 * 60);
            return Response.json([
                at(1, 1_920_000, 'abc250_c'),
                ...Array.from({ length: 498 }, (_, i) => at(2 + i, 1_999_998, 'abc100_a', 'WA')),
                at(500, 1_999_999, 'abc100_a'),
            ]);
        }
        assert.equal(from, 1_999_999);
        return Response.json([at(500, from, 'abc100_a'), at(501, from, 'abc100_b')]);
    });
    assert.deepEqual(await fetchExternalStats('atcoder', 'Alice', previous, historical), {
        total: 3,
        olderSolved: [],
        solves: [
            { problem: 'abc100_a', at: date(100) },
            { problem: 'abc250_c', at: date(1_920_000) },
            { problem: 'abc100_b', at: date(1_999_999) },
        ],
    });
    assert.equal(prior[1].at.getTime(), 1_920_010_000);
    assert.equal(begins.length, 2);
});

it('AtCoder rejects an empty fresh lookup and a saturated timestamp', async (t) => {
    let fill = false;
    useFixtures(t, () => Response.json(fill
        ? Array.from({ length: 500 }, (_, i) => at(i + 1, 1234, 'abc100_a'))
        : []));
    await assert.rejects(fetchExternalStats('atcoder', 'Alice'), /no public submissions/i);
    fill = true;
    await assert.rejects(fetchExternalStats('atcoder', 'Alice'), {
        name: 'ExternalOjHistoryLimit', message: /saturated second/i,
    });
});

it('rejects when pagination reaches its cap and leaves previous history untouched', async (t) => {
    const previous = { solves: [{ problem: '42:C', at: date(100) }] };
    const starts = useFixtures(t, (url) => {
        assert.ok(starts.length <= 40, 'must not keep requesting pages');
        const size = Number(url.searchParams.get('count'));
        const from = Number(url.searchParams.get('from'));
        return Response.json({
            status: 'OK',
            result: Array.from({ length: size }, (_, i) => ac(1000000 - from - i, 100, 'A')),
        });
    });
    await assert.rejects(fetchExternalStats('codeforces', 'Alice', previous), (error: unknown) => (
        error instanceof ExternalOjHistoryLimit && /page cap/i.test(error.message)
    ));
    assert.deepEqual(previous, { solves: [{ problem: '42:C', at: date(100) }] });
});

const nowcoderProfile = (count: number) => new Response(`
    <ul class="profile-menu"><li class="selected">
      <a href="/acm/contest/profile/42/practice-coding">TA的练习</a>
    </li></ul>
    <div class="my-state-item"><div class="state-num">800</div><span>题已练习</span></div>
    <div class="my-state-item" style="width:310px;"><div class="state-num">${count}</div><span>题已通过</span></div>
    <div class="my-state-item"><div class="state-num">900</div><span>次提交</span></div>
`);
const luoguProfile = (count: number | null, uid = 42) => new Response(`
    <script id="lentille-context" type="application/json">{
      "status":200,"template":"user.show","data":{"user":{"uid":${uid},"passedProblemCount":${count}}}
    }</script>
`);
const leetcodeProgress = (entries: { difficulty: string, count: number }[]) => Response.json({
    data: { userProfileUserQuestionProgressV2: { numAcceptedQuestions: entries } },
});

it('uses the official total fields without inventing timestamps', async (t) => {
    useFixtures(t, (url, init) => {
        const source = url.origin + url.pathname;
        if (source === 'https://ac.nowcoder.com/acm/contest/profile/42/practice-coding') return nowcoderProfile(0);
        if (source === 'https://www.luogu.com.cn/user/42') return luoguProfile(131);
        assert.equal(source, 'https://leetcode.cn/graphql/');
        assert.equal(init.method, 'POST');
        assert.deepEqual(JSON.parse(String(init.body)).variables, { userSlug: 'my-slug' });
        return leetcodeProgress([
            { difficulty: 'HARD', count: 7 }, { difficulty: 'EASY', count: 10 }, { difficulty: 'MEDIUM', count: 3 },
        ]);
    });
    assert.deepEqual(await fetchExternalStats('nowcoder', '00042'), { total: 0 });
    assert.deepEqual(await fetchExternalStats('luogu', '42'), { total: 131 });
    assert.deepEqual(await fetchExternalStats('leetcode', 'My-Slug'), { total: 20 });
});

it('rejects a missing profile, hidden or mismatched count, partial GraphQL, and HTTP errors', async (t) => {
    const responses = [
        () => new Response('<title>牛客网-用户不存在</title>'),
        () => luoguProfile(null),
        () => luoguProfile(12, 43),
        () => leetcodeProgress([{ difficulty: 'EASY', count: 3 }, { difficulty: 'HARD', count: 7 }]),
        () => new Response('Too Many Requests', { status: 429 }),
    ];
    useFixtures(t, () => responses.shift()!());
    await assert.rejects(fetchExternalStats('nowcoder', '42'));
    await assert.rejects(fetchExternalStats('luogu', '42'));
    await assert.rejects(fetchExternalStats('luogu', '42'));
    await assert.rejects(fetchExternalStats('leetcode', 'my-slug'));
    await assert.rejects(fetchExternalStats('codeforces', 'Alice'), ExternalOjRateLimit);
});

it('shares the Codeforces limiter across concurrent accounts and stops on a failed request', async (t) => {
    const starts = useFixtures(t, (url) => {
        if (url.searchParams.get('handle') === 'alice') {
            return Response.json({ status: 'FAILED', comment: 'Call limit exceeded' });
        }
        return Response.json({ status: 'OK', result: [] });
    });
    const [alice, bob] = await Promise.allSettled([
        fetchExternalStats('codeforces', 'Alice'),
        fetchExternalStats('codeforces', 'Bob'),
    ]);
    assert.equal(alice.status, 'rejected');
    assert.deepEqual(bob, { status: 'fulfilled', value: { total: 0, solves: [], olderSolved: [] } });
    assert.equal(starts.length, 2);
    assert.ok(starts[1].time - starts[0].time >= 2000);
});

it('propagates a request timeout instead of returning empty data', async (t) => {
    t.mock.method(AbortSignal, 'timeout', (timeout: number) => {
        assert.ok(timeout > 0 && timeout <= 15_000);
        return AbortSignal.abort(new DOMException('Request timed out', 'TimeoutError'));
    });
    const starts = useFixtures(t, (_url, init) => { throw init.signal!.reason; });
    await assert.rejects(fetchExternalStats('luogu', '42'), /timed out/i);
    assert.equal(starts.length, 1);
});

for (const platform of ['codeforces', 'atcoder'] as const) {
    it(`${platform} seeds lifetime IDs and keeps dates starting at the 365-day Beijing boundary`, async (t) => {
        useFixtures(t, (url) => {
            if (platform === 'codeforces') {
                assert.equal(url.searchParams.get('count'), '500');
                return Response.json({
                    status: 'OK',
                    result: [
                        ac(4, windowStart + 100, 'A'), ac(3, windowStart, 'B'),
                        ac(2, windowStart - 1, 'A'), ac(1, windowStart - 100, 'C'),
                    ],
                });
            }
            assert.equal(url.searchParams.get('from_second'), '0');
            return Response.json([
                at(1, windowStart - 100, '42_C'), at(2, windowStart - 1, '42_A'),
                at(3, windowStart, '42_B'), at(4, windowStart + 100, '42_A'),
            ]);
        });
        const id = (index: string) => platform === 'codeforces' ? `42:${index}` : `42_${index}`;
        assert.deepEqual(await fetchExternalStats(platform, 'Alice', undefined, { now: historyNow }), {
            total: 3,
            solves: [{ problem: id('B'), at: date(windowStart) }],
            olderSolved: [id('A'), id('C')],
        });
    });
}

it('Codeforces uses cursorAt and a 100-row page for short gaps and compacts legacy solves', async (t) => {
    const cursor = +historyNow / 1000 - 2 * 24 * 60 * 60;
    const cutoff = cursor - 6 * 60 * 60;
    const previous = {
        lastSuccessAt: date(cursor + 60),
        cursorAt: date(cursor),
        olderSolved: ['42:A'],
        solves: [
            { problem: '42:A', at: date(cutoff) },
            { problem: '42:B', at: date(windowStart - 1) },
        ],
    };
    const starts = useFixtures(t, (url) => {
        const size = Number(url.searchParams.get('count'));
        assert.equal(size, 100);
        return Response.json({
            status: 'OK',
            result: [
                ac(size + 4, cursor + 60, 'A'), ac(size + 3, cursor, 'B'), ac(size + 2, cutoff, 'C'),
                ...Array.from({ length: size - 3 }, (_, i) => ac(size + 1 - i, cutoff - 1, 'D')),
            ],
        });
    });
    assert.deepEqual(await fetchExternalStats('codeforces', 'Alice', previous, { now: historyNow }), {
        total: 3,
        solves: [{ problem: '42:C', at: date(cutoff) }],
        olderSolved: ['42:A', '42:B'],
    });
    assert.equal(starts.length, 1);
    assert.equal(previous.solves.length, 2);
    assert.deepEqual(previous.olderSolved, ['42:A']);
});

it('Codeforces catches up from lastSuccessAt after a long outage with 500-row pages', async (t) => {
    const success = windowStart - 8 * 24 * 60 * 60;
    const starts = useFixtures(t, (url) => {
        const size = Number(url.searchParams.get('count'));
        assert.equal(size, 500);
        if (url.searchParams.get('from') === '1') {
            return Response.json({
                status: 'OK',
                result: Array.from({ length: size }, (_, i) => ac(size + 2 - i, windowStart + 1, 'A')),
            });
        }
        assert.equal(url.searchParams.get('from'), '500');
        return Response.json({ status: 'OK', result: [ac(3, windowStart + 1, 'A'), ac(2, success + 1, 'B')] });
    });
    assert.deepEqual(await fetchExternalStats('codeforces', 'Alice', {
        lastSuccessAt: date(success), solves: [],
    }, { now: historyNow }), {
        total: 2,
        solves: [{ problem: '42:A', at: date(windowStart + 1) }],
        olderSolved: ['42:B'],
    });
    assert.equal(starts.length, 2);
});

it('AtCoder catches up from cursorAt and never re-dates an old ID', async (t) => {
    const cursor = windowStart - 24 * 60 * 60;
    const cutoff = cursor - 24 * 60 * 60;
    useFixtures(t, (url) => {
        assert.equal(url.searchParams.get('from_second'), String(cutoff));
        return Response.json([
            at(1, cutoff, 'old'), at(2, cursor + 1, 'missed'), at(3, windowStart + 1, 'old'), at(4, windowStart + 2, 'new'),
        ]);
    });
    assert.deepEqual(await fetchExternalStats('atcoder', 'Alice', {
        cursorAt: date(cursor), lastSuccessAt: date(windowStart + 10), olderSolved: ['old'],
    }, { now: historyNow }), {
        total: 3,
        solves: [{ problem: 'new', at: date(windowStart + 2) }],
        olderSolved: ['missed', 'old'],
    });
});

it('checks quota after the local limiter for each page and propagates the rejection unchanged', async (t) => {
    const starts = useFixtures(t, () => Response.json({
        status: 'OK',
        result: Array.from({ length: 500 }, (_, i) => ac(500 - i, 100, 'A')),
    }));
    const error = new Error('local quota exhausted');
    const checks: number[] = [];
    await assert.rejects(fetchExternalStats('codeforces', 'Alice', undefined, {
        beforeRequest: async () => {
            checks.push(now);
            if (checks.length === 2) throw error;
        },
    }), (cause: unknown) => cause === error);
    assert.equal(starts.length, 1);
    assert.equal(checks.length, 2);
    assert.equal(checks[0], starts[0].time);
    assert.ok(checks[1] - checks[0] >= 2000);
});
