import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url);
require('@hydrooj/register');
const { balloonColor, balloonConfig, balloonPalette, validateBalloonConfig, balloonView }: typeof import('./balloon-data') =
    require('./balloon-data.ts');

test('balloon palette preserves onsite defaults and normalizes legacy colors without accepting CSS injection', () => {
    const c = balloonConfig({ pids: [12, 13, 14, 15], balloon: { 12: '#AbC', 13: { color: '#000000', name: '黑气球' }, 14: 'red' } });
    assert.equal(c[12].color, '#aabbcc');
    assert.deepEqual(c[13], { color: '#000000', name: '黑气球' });
    assert.equal(c[14].color, '#ff0000');
    assert.equal(c[15].color, '#8400ff');
    assert.equal(new Set(balloonPalette.map((p) => p.color)).size, 16);
    assert.equal(balloonColor('red; background:url(x)'), '');
    assert.equal(balloonColor('constructor'), '');
    assert.equal(balloonColor('__proto__'), '');
    assert.equal(balloonColor(null), '');
});

test('saved colors must match the exact contest roster and have valid color values and short names', () => {
    const config = validateBalloonConfig([12, 13], { 12: '#abc', 13: { color: '#000000', name: '  黑色  ' } });
    assert.deepEqual(config, { 12: { color: '#aabbcc', name: '自定义' }, 13: { color: '#000000', name: '黑色' } });
    for (const input of [null, [], {}, { 12: '#xyz', 13: '#ffffff' }, { 12: '#fff', 13: '#000', 14: '#abc' },
        { 12: '#fff', 13: { color: '#000000', name: 'x'.repeat(31) } }]) {
        assert.throws(() => validateBalloonConfig([12, 13], input));
    }
});

test('balloon lists use team/class identities, tolerate legacy boolean senders and withdraw rejudged/cancelled entries', () => {
    const id = (value) => ({ toString: () => value, getTimestamp: () => new Date('2026-11-08T10:20:00Z') });
    const users = { 2: { name: '张三', uname: 'zhang', class: '软工2601' }, 3: { name: '老师' },
        4: { name: '李四', class: '软工2602' } };
    const list = [
        { _id: id('a'), uid: 2, pid: 12, sent: true, first: true },
        { _id: id('b'), uid: -1, pid: 13, sent: 3, sentAt: new Date('2026-11-08T10:25:00Z') },
        { _id: id('c'), uid: 4, pid: 12 },
        { _id: id('d'), uid: 2, pid: 13 },
    ];
    const view = balloonView({ pids: [12, 13] }, list, users,
        [{ uid: -1, displayName: '队伍甲', members: [2, 4] }, { uid: 4, registrationCancelled: true }],
        [{ _id: 'a', status: 1 }, { _id: 'b', status: 1 }, { _id: 'd', status: 2 }]);
    assert.equal(view.rows[0].sender, '未记录');
    assert.equal(view.rows[1].sender, '老师');
    assert.equal(view.rows[1].team, '队伍甲');
    assert.equal(view.rows[1].className, '软工2601 / 软工2602');
    assert.equal(view.rows[2].status, 'withdrawn');
    assert.equal(view.rows[3].status, 'withdrawn');
    assert.deepEqual(view.counts, { pending: 0, delivered: 2, withdrawn: 2, total: 4 });
});

test('another accepted submission keeps a team balloon valid when the original is rejudged', () => {
    const view = balloonView({ pids: [12] }, [{ _id: 'old', uid: -1, pid: 12 }], {},
        [{ uid: -1, attend: 1, members: [2], journal: [{ rid: 'new' }] }],
        [{ _id: 'old', uid: 2, pid: 12, status: 2 }, { _id: 'new', uid: 2, pid: 12, status: 1 }]);
    assert.equal(view.rows[0].status, 'pending');
    assert.equal(view.counts.withdrawn, 0);
});

test('a deleted source record withdraws the task unless another accepted team submission exists', () => {
    const tdoc = { pids: [12] };
    const balloons = [{ _id: 'deleted', uid: 2, pid: 12 }];
    assert.equal(balloonView(tdoc, balloons, {}, [], []).rows[0].status, 'withdrawn');
    const replacement = { _id: 'replacement', uid: 2, pid: 12, status: 1 };
    assert.equal(balloonView(tdoc, balloons, {}, [], [replacement]).rows[0].status, 'pending');
});

test('balloon location belongs to the original contest participant rather than the user profile or current teammates', () => {
    const view = balloonView({ pids: [12] }, [{ _id: 'one', uid: -1, pid: 12 }],
        { 2: { classroom: 'wrong room', seat: 'wrong seat' } },
        [{ uid: -1, attend: 1, members: [2], classroom: '逸夫楼301', seat: '001', journal: [{ rid: 'one' }] }],
        [{ _id: 'one', uid: 2, pid: 12, status: 1 }]);
    assert.equal(view.rows[0].classroom, '逸夫楼301'); assert.equal(view.rows[0].seat, '001');
    const other = balloonView({ pids: [12] }, [{ _id: 'two', uid: 2, pid: 12 }],
        { 2: { classroom: 'wrong room', seat: 'wrong seat' } }, [], [{ _id: 'two', status: 1 }]);
    assert.equal(other.rows[0].classroom, ''); assert.equal(other.rows[0].seat, '');
});
