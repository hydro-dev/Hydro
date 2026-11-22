import assert from 'node:assert/strict';
import test from 'node:test';
const { selectRatingContests }: typeof import('../hydrooj/src/lib/rating') = await import(new URL('../hydrooj/src/lib/rating.ts', import.meta.url).href);

test('unfinished onsite contests cannot displace older eligible contests from the most recent ten', async () => {
    const entries = Array.from({ length: 15 }, (_, id) => ({ id, rule: id < 3 ? 'icpc_domjudge' : 'acm' }));
    async function* cursor() { yield* entries; }
    const result = await selectRatingContests(cursor(), { icpc_domjudge: { ratingReady: async () => false }, acm: {} });
    assert.deepEqual(result.map((t) => t.id), [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});

test('rules without a rating readiness hook keep their existing order and selection', async () => {
    const entries = [{ id: 1, rule: 'acm' }, { id: 2, rule: 'oi' }, { id: 3, rule: 'icpc_domjudge' }];
    async function* cursor() { yield* entries; }
    const result = await selectRatingContests(cursor(), { acm: {}, oi: {}, icpc_domjudge: { ratingReady: () => true } });
    assert.deepEqual(result, entries);
});
