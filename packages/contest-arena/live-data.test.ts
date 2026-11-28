import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url);
require('@hydrooj/register');
const { ObjectId } = require('mongodb');
const { buildLiveData, changesBetween, feedKey, publicFeedEvent }: typeof import('./live-data') = require('./live-data.ts');

const start = new Date('2026-11-08T10:00:00Z');
const cid = '6af18454cd466e0f6c764f12';
const contest = { docId: cid, domainId: 'system', title: '现场赛', rule: 'icpc_domjudge', beginAt: start,
    endAt: new Date(+start + 10800000), lockAt: new Date(+start + 7200000), pids: [1, 2] };
const users = { 1: { name: '甲', class: '软工2601', password: 'PRIVATE_PASSWORD', stuid: 'PRIVATE_STUID' },
    2: { name: '乙', class: '计科2602' }, '-10': { name: '同队', class: '软工2601' } };
const problems = { 1: { title: '题目甲', config: { timeMax: 1000 } }, 2: { title: '题目乙', config: {} } };
let seq = 0;
function record(seconds: number, status: number, pid = 1, uid = 1) {
    return { _id: new ObjectId((Math.floor((+start + seconds * 1000) / 1000)).toString(16) + String(seq++).padStart(16, '0')),
        uid, pid, domainId: 'system', contest: new ObjectId(cid), status, lang: 'cc.cc17',
        judgeAt: status === 0 ? null : new Date(+start + seconds * 1000 + 3000),
        code: 'PRIVATE_SOURCE_CODE', testCases: [{ input: 'PRIVATE_TEST_DATA' }] };
}
function build(records: any[], overrides = {}, rows: any[] = [{ uid: 1, attend: 1, journal: [] }], at = 9000, previous = {}) {
    return buildLiveData({ ...contest, ...overrides }, rows, records, users, problems, { 'cc.cc17': { display: 'C++17' } },
        new Date(+start + at * 1000), previous);
}

test('public projection contains class-name and images, but no source, tests or private account fields', () => {
    const result = build([record(125, 1)]);
    assert.equal(result.collections.teams[0].name, '软工2601-甲');
    assert.equal(result.collections.teams[0].photo[0].href, `contests/${cid}/images/team-1.png`);
    assert.equal(result.scoreboard.rows[0].score.num_solved, 1);
    assert.equal(result.scoreboard.rows[0].score.total_time, 2);
    assert(!JSON.stringify(result.objects).includes('PRIVATE_'));
});

test('freeze hides final judgements on the inclusive boundary, not just in the scoreboard renderer', () => {
    const early = record(100, 1); const boundary = record(7200, 1, 2);
    const frozen = build([early, boundary]);
    assert.equal(frozen.collections.submissions.length, 2);
    assert.equal(frozen.collections.judgements.length, 1);
    assert(!JSON.stringify(frozen.collections.judgements).includes(String(boundary._id)));
    assert.equal(frozen.scoreboard.rows[0].score.num_solved, 1);
    assert.equal(frozen.scoreboard.rows[0].problems[1].num_pending, 1);
    const full = build([early, boundary], { unlocked: true });
    assert.equal(full.collections.judgements.length, 2);
    assert.equal(full.scoreboard.rows[0].score.num_solved, 2);
    assert(full.state.thawed);
    assert.equal(full.policy, frozen.policy);
    const next = build([early, boundary], { unlocked: true }, undefined, 9100, full.state);
    assert.equal(next.state.thawed, full.state.thawed);
});

test('relocking and rejudge resume cannot replay obsolete verdicts from a formerly public checkpoint', () => {
    const submission = record(7300, 1);
    const thawed = build([submission], { unlocked: true });
    const frozen = build([submission]);
    const visible = new Set<string>(frozen.collections.judgements.map((j) => j.id));
    const old = thawed.objects.find((o) => o.type === 'judgements');
    assert.equal(publicFeedEvent(old, visible).data, null);
    assert.equal(frozen.policy, thawed.policy);
    const pending = build([{ ...submission, status: 0, judgeAt: null }], { unlocked: true });
    const pendingIds = new Set<string>(pending.collections.judgements.map((j) => j.id));
    assert.equal(publicFeedEvent(old, pendingIds).data, null);
    const current = thawed.objects.find((o) => o.type === 'submissions');
    assert.equal(publicFeedEvent(current, pendingIds), current);
});

test('rejudge uses the current record instead of a stale AC journal and replaces the old judgement', () => {
    const original = record(150, 1);
    const rows = [{ uid: 1, attend: 1, journal: [{ rid: original._id, pid: 1, status: 1, lang: original.lang }] }];
    const old = build([original], {}, rows);
    const waiting = build([{ ...original, status: 0, judgeAt: null }], {}, rows);
    assert.equal(waiting.scoreboard.rows[0].score.num_solved, 0);
    assert.equal(waiting.scoreboard.rows[0].problems[0].num_pending, 1);
    assert.equal(waiting.collections.judgements.length, 0);
    const changes = changesBetween(new Map(old.objects.map((o) => [feedKey(o), o])), waiting.objects);
    const removed = changes.findIndex((o) => o.type === 'judgements' && o.data === null);
    assert(removed >= 0);
    assert(!changes.some((o) => o.type === 'judgements' && o.data !== null));
    const wrong = build([{ ...original, status: 2, judgeAt: new Date(+start + 9000000) }], {}, rows);
    assert.equal(wrong.scoreboard.rows[0].score.num_solved, 0);
    assert.equal(wrong.collections.judgements[0].judgement_type_id, 'WA');
});

test('compiler errors do not add penalty, wrong attempts do, and repeat AC does not count twice', () => {
    const result = build([record(10, 7), record(30, 2), record(125, 1), record(200, 1)]);
    assert.equal(result.scoreboard.rows[0].score.num_solved, 1);
    assert.equal(result.scoreboard.rows[0].score.total_time, 22);
    // CE remains in the submission/judgement feed but is absent from scoreboard attempts.
    assert.equal(result.scoreboard.rows[0].problems[0].num_judged, 2);
    assert(result.collections.judgements.some((j) => j.judgement_type_id === 'CE'));
});

test('team ownership and cancelled journals prevent old submissions moving into a different roster', () => {
    const old = record(20, 1); const current = record(40, 1, 2);
    const rows = [{ uid: 1, attend: 0, registrationCancelled: true, journal: [{ rid: old._id, pid: 1, status: 1 }] },
        { uid: -10, attend: 1, members: [1, 2], displayName: '同队', journal: [] }];
    const result = build([old, current], {}, rows);
    assert.equal(result.collections.submissions.length, 1);
    assert.equal(result.collections.submissions[0].team_id, 'team-g10');
    assert.equal(result.scoreboard.rows[0].score.num_solved, 1);
    assert.equal(result.collections.teams[0].display_name, '软工2601 / 计科2602-同队');
});

test('pre-start data hides statements and submissions; out-of-window, other-domain and ignored records never leak', () => {
    const r = record(100, 1);
    const before = build([r], {}, undefined, -60);
    assert.equal(before.collections.submissions.length, 0);
    assert.equal(before.collections.problems[0].name, 'Problem A');
    assert.equal(before.state.started, null);
    const result = build([record(-1, 1), record(10800, 1), { ...r, domainId: 'other' }, record(50, 9), record(60, 31)]);
    assert.equal(result.collections.submissions.length, 0);
    assert.equal(result.scoreboard.rows[0].score.num_solved, 0);
});

test('starred participants remain hidden to official presentations and outside official API ranks', () => {
    const result = build([record(100, 1), record(110, 1, 1, 2)], {},
        [{ uid: 1, attend: 1, unrank: true, journal: [] }, { uid: 2, attend: 1, journal: [] }]);
    assert.equal(result.collections.teams.find((t) => t.id === 'team-1').hidden, true);
    assert.deepEqual(result.scoreboard.rows.map((r) => r.team_id), ['team-2']);
});

test('unsupported results fail closed; unchanged objects produce no redundant events', () => {
    assert.throws(() => build([record(100, 999)]));
    const result = build([record(100, 1)]);
    assert.equal(changesBetween(new Map(result.objects.map((o) => [feedKey(o), o])), result.objects).length, 0);
});
