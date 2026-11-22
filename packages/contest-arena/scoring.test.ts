import assert from 'node:assert/strict';
import test from 'node:test';
const { ranked, score, ratingReady, finalizedSnapshot }: typeof import('./scoring') = await import(
    new URL('./scoring.ts', import.meta.url).href
);

const start = new Date('2026-11-08T10:00:00Z');
const contest = { beginAt: start, endAt: new Date(+start + 5 * 3600000), pids: [1, 2] };
let serial = 0;
function entry(seconds: number, status: number, pid = 1) {
    const id = String(seconds).padStart(8, '0') + String(serial++).padStart(16, '0');
    const rid = { getTimestamp: () => new Date(+start + seconds * 1000), toHexString: () => id };
    return { rid, status, pid, score: status === 1 ? 100 : 0 };
}

test('minute precision, wrong penalty, CE and system/pending exclusions', () => {
    const result = score(contest, [entry(30, 7), entry(50, 2), entry(60, 8), entry(100, 0), entry(125, 1)]);
    assert.equal(result.accept, 1);
    assert.equal(result.time, 22 * 60);
    assert.equal(result.detail[1].naccept, 1);
});
test('only first AC counts, submissions are sorted, duplicates are ignored', () => {
    const ac = entry(125, 1);
    const result = score(contest, [entry(500, 1), ac, entry(35, 2), ac]);
    assert.equal(result.time, 22 * 60);
    assert.equal(result.detail[1].real, 120);
});
test('freeze is inclusive and does not reveal post-freeze success', () => {
    const freeze = new Date(+start + 120000);
    const journal = [entry(119, 2), entry(120, 1)];
    const visible = score(contest, journal, freeze);
    assert.equal(visible.accept, 0);
    assert.equal(visible.detail[1].npending, 1);
    assert.equal(visible.detail[1].status, 2);
    assert.equal(score(contest, journal).accept, 1);
});
test('pre-freeze submission judged later still affects frozen board', () => {
    const result = score(contest, [entry(119, 1)], new Date(+start + 120000));
    assert.equal(result.accept, 1);
});

test('cancelled, ignored and system results never become pending when frozen', () => {
    const freeze = new Date(+start + 120000);
    for (const status of [8, 9, 10, 30, 31]) {
        const result = score(contest, [entry(121, status)], freeze);
        assert.equal(result.accept, 0);
        assert.equal(result.detail[1]?.npending || 0, 0);
    }
    assert.equal(score(contest, [entry(121, 0)], freeze).detail[1].npending, 1);
});
test('start accepted, end excluded, no out-of-contest problem', () => {
    const result = score(contest, [entry(-1, 1), entry(0, 1), entry(18000, 1, 2), entry(30, 1, 3)]);
    assert.equal(result.accept, 1);
    assert.equal(result.time, 0);
});
test('last-AC tie break, shared rank and unofficial teams', () => {
    const result = ranked([
        { uid: 1, accept: 2, time: 120, lastAccepted: 120 },
        { uid: 2, accept: 2, time: 120, lastAccepted: 60 },
        { uid: 3, accept: 2, time: 120, lastAccepted: 60 },
        { uid: 4, accept: 3, time: 0, unrank: true },
    ]);
    assert.deepEqual(
        result.map((row) => [row.uid, row.rank]),
        [
            [2, 1],
            [3, 1],
            [1, 3],
            [4, '*'],
        ],
    );
});

test('onsite rating waits for the global end, unfreeze and complete judgements', () => {
    const rows = [{ attend: 1, journal: [entry(120, 1)] }];
    const end = +contest.endAt;
    assert.equal(ratingReady(contest, rows, end - 1), false);
    assert.equal(ratingReady(contest, rows, end), true);
    const frozen = { ...contest, lockAt: new Date(+start + 60000) };
    assert.equal(ratingReady(frozen, rows, end), false);
    assert.equal(ratingReady({ ...frozen, unlocked: true }, rows, end), true);
    for (const status of [0, 20, 21, 22, 999]) {
        assert.equal(ratingReady(contest, [{ attend: 1, journal: [entry(120, status)] }], end), false);
    }
});

test('empty, cancelled and unofficial-only contests do not consume personal rating slots', () => {
    const end = +contest.endAt;
    assert.equal(ratingReady(contest, [], end), false);
    assert.equal(ratingReady(contest, [{ attend: 0, journal: [entry(120, 1)] }], end), false);
    assert.equal(ratingReady(contest, [{ attend: 1, unrank: true, journal: [entry(120, 1)] }], end), false);
    assert.equal(
        ratingReady(contest, [{ attend: 1, journal: [entry(-1, 1), entry(18000, 1), entry(120, 1, 999)] }], end),
        false,
    );
    assert.equal(ratingReady(contest, [{ attend: 1, journal: [entry(120, 7)] }], end), true);
});

test('snapshot validation blocks rejudging and final verdicts not yet reflected in the journal', () => {
    const accepted = entry(120, 1);
    const row = { uid: 1, attend: 1, journal: [accepted] };
    const record = { _id: accepted.rid, uid: 1, pid: 1, status: 1 };
    assert.equal(finalizedSnapshot(contest, [row], [record]), true);
    for (const status of [0, 20, 21, 22, 2, 999]) {
        assert.equal(finalizedSnapshot(contest, [row], [{ ...record, status }]), false);
    }
    assert.equal(finalizedSnapshot(contest, [row], []), false);
    assert.equal(finalizedSnapshot(contest, [row], [{ ...record, pid: 2 }]), false);
});

test('a newly inserted submission must have its initial journal entry before snapshot finalization', () => {
    const submitted = entry(120, 1);
    const record = { _id: submitted.rid, uid: 1, pid: 1, status: 0 };
    assert.equal(finalizedSnapshot(contest, [{ uid: 1, attend: 1, journal: [] }], [record]), false);
    assert.equal(finalizedSnapshot(contest, [{ uid: -1, members: [1, 2], attend: 1, journal: [] }], [record]), false);
    assert.equal(finalizedSnapshot(contest, [{ uid: 2, attend: 1, journal: [] }], [record]), true);
});

test('cancelled-entry history remains archived when its user joins a different entry', () => {
    const old = entry(60, 1);
    const current = entry(120, 1);
    const rows = [
        { uid: 1, attend: 0, registrationCancelled: true, journal: [old] },
        { uid: -2, members: [1, 3], attend: 1, journal: [current] },
    ];
    const records = [
        { _id: old.rid, uid: 1, pid: 1, status: 0 },
        { _id: current.rid, uid: 3, pid: 1, status: 1 },
    ];
    assert.equal(finalizedSnapshot(contest, rows, records), true);
    assert.equal(finalizedSnapshot(contest, rows.slice(1), records), false);
    assert.equal(finalizedSnapshot(contest, [rows[1], { ...rows[1], uid: -3 }], records), false);
});
