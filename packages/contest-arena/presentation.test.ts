import assert from 'node:assert/strict';
import { test } from 'node:test';
const { contestTime, juryAnswered }: typeof import('./presentation') = await import(
    new URL('./presentation.ts', import.meta.url).href
);

test('submission and clarification times preserve seconds and elapsed hours', () => {
    assert.equal(contestTime(0, 1000), '-0:00:01');
    assert.equal(contestTime(0, 0), '0:00:00');
    assert.equal(contestTime(3599999, 0), '0:59:59');
    assert.equal(contestTime(3661000, 0), '1:01:01');
    assert.equal(contestTime(new Date('2026-11-08T13:01:01Z'), new Date('2026-11-08T10:00:00Z')), '3:01:01');
});

test('a participant follow-up does not count as a jury answer', () => {
    assert.equal(juryAnswered(), false);
    assert.equal(juryAnswered([{ owner: 42 }]), false);
    assert.equal(juryAnswered([{ owner: 42 }, { owner: 0 }]), true);
});

test('a new follow-up reopens a thread that the jury previously answered', () => {
    assert.equal(juryAnswered([{ owner: 42 }, { owner: 0 }, { owner: 42 }]), false);
    assert.equal(juryAnswered([{ owner: 42 }, { owner: 0 }, { owner: 42 }, { owner: 0 }]), true);
});
