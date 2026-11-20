import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    beijingDay, buildDailyActivity, buildExternalDailySnapshot, externalSyncRound, firstPasses, nextBeijingSync, syncState,
} from '../packages/hydrooj/src/lib/externalOjStats';

test('Beijing day and next 21:00 refresh use UTC+08 independently of host timezone', () => {
    assert.equal(beijingDay(new Date('2026-11-18T16:00:00Z')), '2026-11-19');
    assert.equal(nextBeijingSync(new Date('2026-11-18T12:59:59Z')).toISOString(), '2026-11-18T13:00:00.000Z');
    assert.equal(nextBeijingSync(new Date('2026-11-18T13:00:00Z')).toISOString(), '2026-11-19T13:00:00.000Z');
});

test('first AC is per platform problem and uses the earliest successful timestamp', () => {
    const first = new Date('2026-11-18T15:50:00Z');
    const later = new Date('2026-11-18T16:10:00Z');
    assert.deepEqual(firstPasses([
        { problem: '123A', at: later }, { problem: '456B', at: later }, { problem: '123A', at: first },
    ]), [{ problem: '123A', at: first }, { problem: '456B', at: later }]);
    const days = buildDailyActivity([
        { id: 'hgnu', solves: [{ problem: '123A', at: first }] },
        { id: 'codeforces', solves: [{ problem: '123A', at: later }, { problem: '123A', at: first }] },
        { id: 'leetcode' },
    ], later, 2);
    assert.deepEqual(days, [
        { day: '2026-11-18', total: 2, counts: [1, 1, null] },
        { day: '2026-11-19', total: 0, counts: [0, 0, null] },
    ]);
});

test('uncertain history is not treated as zero, including the all-platform total', () => {
    assert.deepEqual(buildDailyActivity([{ id: 'nowcoder' }], new Date('2026-11-18T04:00:00Z'), 1), [
        { day: '2026-11-18', total: null, counts: [null] },
    ]);
});

test('dates after the last external snapshot are unknown rather than zero', () => {
    assert.deepEqual(buildDailyActivity([
        { id: 'hgnu', solves: [] },
        { id: 'codeforces', solves: [], through: new Date('2026-11-18T04:00:00Z') },
    ], new Date('2026-11-18T16:00:00Z'), 2), [
        { day: '2026-11-18', total: 0, counts: [0, 0] },
        { day: '2026-11-19', total: 0, counts: [0, null] },
    ]);
});

test('sync failure is visible even when the previously successful count was zero', () => {
    const previous = new Date('2026-11-18T04:00:00Z');
    const failure = new Date('2026-11-19T04:00:00Z');
    assert.equal(syncState(), 'unbound');
    assert.equal(syncState({}), 'pending');
    assert.equal(syncState({ lastSuccessAt: previous }), 'success');
    assert.equal(syncState({ lastSuccessAt: previous, failedAt: failure }), 'failed');
});

test('nightly snapshot increments require consecutive rounds and keep the first sample of a round', () => {
    const first = new Date('2026-11-18T13:00:00Z');
    const second = new Date('2026-11-19T13:00:00Z');
    assert.equal(externalSyncRound(new Date('2026-11-19T12:59:59Z')).toISOString(), first.toISOString());
    assert.equal(externalSyncRound(new Date('2026-11-19T16:01:00Z')).toISOString(), second.toISOString());
    const baseline = buildExternalDailySnapshot(100, undefined, first);
    assert.equal(baseline.increment, null);
    const updated = buildExternalDailySnapshot(107, baseline, second);
    assert.equal(updated.increment, 7);
    assert.deepEqual(buildExternalDailySnapshot(109, updated, new Date(+second + 60_000)), updated);
    assert.equal(buildExternalDailySnapshot(110, baseline, new Date(+second + 86_400_000)).increment, null);
    assert.equal(buildExternalDailySnapshot(90, baseline, second).increment, null);
    assert.equal(buildExternalDailySnapshot(100, baseline, second).increment, 0);
});
