import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url);
require('@hydrooj/register');
const { participantLocation, locationAssignments, groupRosterEntries }: typeof import('./seating') = require('./seating.ts');

test('contest locations allow optional room and textual seats without losing leading zeros', () => {
    assert.deepEqual(participantLocation({ classroom: ' 逸夫楼301 ', seat: ' 001 ' }), { classroom: '逸夫楼301', seat: '001' });
    assert.deepEqual(participantLocation({ seat: 'A-01' }), { classroom: '', seat: 'A-01' });
    assert.deepEqual(participantLocation({}), { classroom: '', seat: '' });
});

test('location fields reject non-text, control characters and excessive lengths', () => {
    for (const value of [null, [], { classroom: 301 }, { seat: 1 }, { classroom: 'A\nB' },
        { seat: 'A\u0000B' }, { classroom: 'x'.repeat(101) }, { seat: 'x'.repeat(41) }]) {
        assert.throws(() => participantLocation(value));
    }
});

test('bulk add locations only target the selected individual or team identities', () => {
    assert.equal(locationAssignments(undefined, [1]).size, 0);
    const entries = locationAssignments({ 1: { seat: '001' }, '-2': { classroom: '301', seat: 'T-1' } }, [1, -2]);
    assert.equal(entries.get(1).seat, '001'); assert.equal(entries.get(-2).seat, 'T-1');
    for (const value of [null, [], { 9: {} }, { '01': {} }, { 1: { seat: false } }]) {
        assert.throws(() => locationAssignments(value, [1]));
    }
});

test('roster deduplication preserves distinct seats for identical class-name pairs', () => {
    const base = { className: '软工2601', name: '张三' };
    const rows = groupRosterEntries([
        { ...base, line: 2, location: { classroom: '301', seat: '001' } },
        { ...base, line: 3, location: { classroom: '301', seat: '002' } },
        { ...base, line: 4, location: { classroom: '301', seat: '001' } },
    ]);
    assert.equal(rows.length, 2); assert.deepEqual(rows[0].lines, [2, 4]);
    assert.equal(rows[1].location.seat, '002');
    const legacy = groupRosterEntries([{ ...base, line: 2 }, { ...base, line: 3 }]);
    assert.equal(legacy.length, 1); assert.equal(legacy[0].location, undefined);
});
