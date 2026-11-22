import assert from 'node:assert/strict';
import test from 'node:test';
const { identityKey, modeWindow, MODE_LEAD_MS, canReuseTeamRoster }: typeof import('./mode-policy') = await import(new URL('./mode-policy.ts', import.meta.url).href);

const beginAt = new Date('2026-11-08T10:00:00Z');
const endAt = new Date(+beginAt + 3 * 3600000);

test('a team with submissions cannot transfer its result to a changed roster', () => {
    assert.equal(canReuseTeamRoster({ members: [1, 2], journal: [{}] }, [2, 1]), true);
    assert.equal(canReuseTeamRoster({ members: [1, 2], journal: [{}] }, [1, 3]), false);
    assert.equal(canReuseTeamRoster({ journal: [{}] }, [1, 2]), false);
    assert.equal(canReuseTeamRoster({ members: [1, 2], journal: [] }, [1, 3]), true);
});
test('onsite mode starts exactly twenty minutes before the contest', () => {
    const tdoc = { rule: 'icpc_domjudge', beginAt, endAt };
    assert.equal(MODE_LEAD_MS, 1200000);
    assert.equal(modeWindow(tdoc, +beginAt - MODE_LEAD_MS - 1).active, false);
    assert.deepEqual(modeWindow(tdoc, +beginAt - MODE_LEAD_MS), { active: true, startsAt: +beginAt - MODE_LEAD_MS });
    assert.equal(modeWindow(tdoc, +beginAt + 7 * 86400000).active, false);
});

test('onsite mode ends for everyone exactly at the global contest end', () => {
    const tdoc = { rule: 'icpc_domjudge', beginAt, endAt };
    assert.equal(modeWindow(tdoc, +endAt - 1).active, true);
    assert.equal(modeWindow(tdoc, +endAt).active, false);
    assert.equal(modeWindow(tdoc, +endAt + 1).active, false);
    assert.equal(modeWindow({ ...tdoc, endAt: NaN }, +beginAt).active, false);
    assert.equal(modeWindow({ ...tdoc, endAt: beginAt }, +beginAt).active, false);
});
test('other rules never enforce account mode, even with a legacy arena flag', () => {
    for (const rule of ['acm', 'oi', 'ioi', 'homework', 'strictioi']) {
        assert.equal(modeWindow({ rule, beginAt, endAt, arenaEnabled: true } as any, +beginAt).active, false, rule);
    }
    assert.equal(modeWindow({ rule: 'icpc_domjudge', beginAt: NaN, endAt }).active, false);
});
test('roster identity uses both exact class and name, trimming only outer whitespace', () => {
    assert.equal(identityKey(' 软工2601 ', ' 张三\n'), identityKey('软工2601', '张三'));
    assert.notEqual(identityKey('软工2601', '张三'), identityKey('软工2602', '张三'));
    assert.notEqual(identityKey('ab', 'c'), identityKey('a', 'bc'));
});
