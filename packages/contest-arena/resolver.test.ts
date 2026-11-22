import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url);
require('@hydrooj/register');
const {
    buildResolverData,
    relativeTime,
    resolverFreeze,
    resolverWindowsLauncher,
}: typeof import('./resolver') = require('./resolver.ts');

const start = new Date('2026-11-08T10:00:00Z');
const tdoc = {
    docId: '6af18454cd466e0f6c764f12',
    title: '结训赛',
    rule: 'icpc_domjudge',
    beginAt: start,
    endAt: new Date(+start + 10800000),
    lockAt: new Date(+start + 7200000),
    pids: [1, 2],
    medals: { gold: 1, silver: 1, bronze: 0 },
};
const users = {
    1: { name: '甲', uname: 'a', class: '软工2601', password: 'never-export', stuid: 'never-export' },
    2: { name: '乙', uname: 'b', class: '软工2602' },
    3: { name: '丙', uname: 'c', class: '软工2601' },
};
const problems = { 1: { title: 'A', config: { timeMax: 1500, count: 48 } }, 2: { title: 'B', config: {} } };
let serial = 0;
function entry(seconds: number, status = 1, pid = 1) {
    const id =
        Math.floor((+start + seconds * 1000) / 1000)
            .toString(16)
            .padStart(8, '0') + String(serial++).padStart(16, '0');
    return {
        rid: { toHexString: () => id, getTimestamp: () => new Date(+start + seconds * 1000) },
        pid,
        status,
        lang: 'cc.cc20',
    };
}
const build = (rows: any[], overrides = {}, opts = {}) =>
    buildResolverData(
        { ...tdoc, ...overrides },
        rows,
        users,
        problems,
        { 'cc.cc20': { display: 'C++20' } },
        { now: new Date(+start + 14400000), ...opts },
    );

test('ICPC package uses pass-fail, RELTIME penalty, exact timestamps, configured balloon colors', () => {
    const data = build([{ uid: 1, attend: 1, journal: [entry(121), entry(7200, 1, 2)] }], { balloon: { 1: '#abc' } });
    assert.equal(data.contest.scoreboard_type, 'pass-fail');
    assert.equal(data.contest.penalty_time, '0:20:00.000');
    assert.equal(data.contest.scoreboard_freeze_duration, '1:00:00.000');
    assert.equal(data.collections.problems[0].rgb, '#aabbcc');
    assert.equal(data.collections.problems[0].test_data_count, 48);
    assert.equal(data.collections.submissions[0].contest_time, '0:02:01.000');
    assert.equal(data.collections.submissions[0].time, '2026-11-08T10:02:01.000Z');
    assert.equal(data.manifest.final_standings[0].num_solved, 2);
    assert.equal(data.manifest.frozen_standings[0].num_solved, 1);
});

test('whole-minute penalties, compiler errors, ignored results and out-of-window entries agree with onsite scoring', () => {
    const duplicate = entry(125);
    const data = build([
        {
            uid: 1,
            attend: 1,
            journal: [
                entry(-1),
                entry(10, 7),
                entry(20, 2),
                entry(30, 8),
                entry(40, 9),
                entry(50, 30),
                duplicate,
                duplicate,
                entry(10800, 1, 2),
                entry(100, 1, 999),
            ],
        },
    ]);
    assert.equal(data.manifest.final_standings[0].total_time_minutes, 22);
    assert.equal(data.collections.submissions.length, 3);
    assert.equal(data.manifest.excluded_judgements, 3);
    assert.equal(data.collections['judgement-types'].find((item) => item.id === 'CE').penalty, false);
});

test('replay freeze is configurable without mutating a contest that never froze', () => {
    const source = { ...tdoc, lockAt: null, unlocked: true };
    const original = JSON.stringify(source);
    assert.equal(resolverFreeze(source).freezeAt.toISOString(), '2026-11-08T12:00:00.000Z');
    const data = build([], { lockAt: null, unlocked: true }, { freezeMinutes: 30 });
    assert.equal(data.contest.scoreboard_freeze_duration, '0:30:00.000');
    assert.equal(data.manifest.replay_freeze, true);
    assert.equal(data.manifest.source_unlocked, true);
    assert.equal(JSON.stringify(source), original);
    assert.equal(resolverFreeze(tdoc, 30).minutes, 60, 'A configured freeze cannot be overridden');
});

test('post-freeze cancelled and ignored records do not create phantom Resolver pending cells', () => {
    const data = build([{ uid: 1, attend: 1, journal: [entry(7201, 9), entry(7202, 30), entry(7203, 8)] }]);
    assert.equal(data.collections.submissions.length, 0);
    assert.equal(data.manifest.frozen_standings[0].num_solved, 0);
    assert.equal(data.collections.judgements.length, 0);
});

test('all three medal bands are explicit; zero solves, cancelled and unofficial users get no medals', () => {
    const data = build([
        { uid: 1, attend: 1, journal: [entry(100)] },
        { uid: 2, attend: 1, unrank: true, journal: [entry(10)] },
        { uid: 3, attend: 1, journal: [] },
        { uid: 4, attend: 0, journal: [entry(1)] },
    ]);
    assert.deepEqual(
        data.collections.awards.map((item) => [item.id, item.team_ids]),
        [
            ['gold-medal', ['team-1']],
            ['silver-medal', []],
            ['bronze-medal', []],
        ],
    );
    assert.equal(data.collections.teams.find((item) => item.id === 'team-2').hidden, true);
    assert.equal(data.collections.teams.length, 3);
    assert.equal(data.manifest.ranked_participants, 2);
    assert.equal(data.manifest.final_standings.find((item) => item.team_id === 'team-2').rank, '*');
});

test('same score/time/last-AC users remain tied, and team class captions include members', () => {
    const data = build([
        { uid: 1, attend: 1, journal: [entry(125)] },
        { uid: 2, attend: 1, journal: [entry(129)] },
        { uid: -1, attend: 1, displayName: '测试队', members: [1, 2], journal: [entry(300)] },
    ]);
    assert.deepEqual(
        data.manifest.final_standings.map((item) => item.rank),
        [1, 1, 3],
    );
    assert.equal(data.collections.teams.find((item) => item.id === 'team-g1').name, '软工2601 / 软工2602-测试队');
    assert.equal(
        data.collections.organizations.find((item) => item.id === 'affiliation-team-g1').name,
        '软工2601 / 软工2602',
    );
    assert(!JSON.stringify(data.events).includes('never-export'));
});

test('incomplete or ambiguous judgements cannot be silently finalized', () => {
    for (const state of [0, 20, 21, 22, 999]) { assert.throws(() => build([{ uid: 1, attend: 1, journal: [entry(600, state)] }])); }
    const one = entry(500);
    assert.throws(() => build([{ uid: 1, attend: 1, journal: [one, { ...one, status: 2 }] }]), /冲突/);
});

test('invalid dates, freeze durations and unsupported rules are rejected', () => {
    for (const value of ['', 'NaN', -1, 0, Infinity, 181]) { assert.throws(() => resolverFreeze({ ...tdoc, lockAt: null }, value)); }
    assert.throws(() => build([], { rule: 'acm' }), /现场赛/);
    assert.throws(() => build([], {}, { now: start }), /比赛结束/);
    assert.throws(() => resolverFreeze({ ...tdoc, lockAt: tdoc.endAt }));
    assert.throws(() => resolverFreeze({ ...tdoc, beginAt: 'invalid' }));
    assert.equal(relativeTime(90061001), '25:01:01.001');
});

test('event tokens are unique and references precede submissions; final state is complete and frozen', () => {
    const data = build([{ uid: 1, attend: 1, journal: [entry(600)] }]);
    assert.equal(new Set(data.events.map((event) => event.token)).size, data.events.length);
    assert.equal(data.events[0].type, 'contest');
    const firstSubmission = data.events.findIndex((event) => event.type === 'submissions');
    assert(data.events.findIndex((event) => event.type === 'teams') < firstSubmission);
    assert(data.events.findIndex((event) => event.type === 'problems') < firstSubmission);
    assert.equal(data.events.at(-1).type, 'state');
    assert(data.events.at(-1).data.finalized && data.events.at(-1).data.end_of_updates && data.events.at(-1).data.frozen);
    assert(!Object.hasOwn(data.events.at(-1).data, 'thawed'));
});

test('Chinese class-name labels and the Windows font setup survive export consistently', () => {
    const data = build([{ uid: 1, attend: 1, journal: [entry(600)] }]);
    const team = data.collections.teams[0];
    assert.equal(team.name, '软工2601-甲');
    assert.equal(team.display_name, team.name);
    assert.equal(data.events.find((event) => event.type === 'teams').data.name, team.name);
    assert.equal(users[1].name, '甲');
    assert(resolverWindowsLauncher.includes('set "ICPC_FONT=Microsoft YaHei"'));
    assert(!resolverWindowsLauncher.includes('setx'));
});
