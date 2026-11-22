import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
const require = createRequire(import.meta.url);
require('@hydrooj/register');
const { judgeMessage, submissionResult }: typeof import('./submission') = require('./submission.ts');

const record = {
    status: 2,
    score: 50,
    time: 43,
    memory: 2048,
    judgeAt: new Date('2026-11-22T10:00:00Z'),
    progress: 75,
    compilerTexts: ['\u001B[33mwarning\u001B[0m'],
    judgeTexts: [{ message: 'Private checker {0}', params: ['expected output'], stack: 'private stack' }],
    testCases: [
        { id: 2, subtaskId: 2, status: 2, time: 23, memory: 2048, score: 0, message: 'private case' },
        { id: 1, subtaskId: 1, status: 1, time: 20, memory: 128, score: 50, message: '' },
    ],
    subtasks: { 2: { status: 2, score: 0, type: 'min' }, 1: { status: 1, score: 50, type: 'sum' } },
};

test('live participants receive no testcase, checker, metric or progress data', () => {
    const output = submissionResult(record, false, true);
    assert.deepEqual(Object.keys(output).sort(), ['compilation', 'compiler', 'pending', 'status', 'verdict']);
    assert.equal(output.compiler, 'warning');
    const json = JSON.stringify(output);
    for (const secret of ['Private checker', 'private case', 'private stack', 'testCases', 'judgeAt', 'progress', 'memory']) {
        assert(!json.includes(secret));
    }
});

test('authorized details retain testcase results, subtasks and binary memory units without mutating records', () => {
    const before = structuredClone(record);
    const output = submissionResult(record, true, true);
    assert.ok('details' in output);
    assert.equal(output.details.totalTime, '43 ms');
    assert.equal(output.details.peakTime, '23 ms');
    assert.equal(output.details.peakMemory, '2 MiB');
    assert.equal(output.details.judgedAt, '2026-11-22T10:00:00.000Z');
    assert.deepEqual(output.details.cases.map((item) => [item.subtask, item.id, item.verdict, item.memory]), [
        [1, 1, 'CORRECT', '128 KiB'], [2, 2, 'WRONG-ANSWER', '2 MiB'],
    ]);
    assert.deepEqual(output.details.subtasks.map((item) => [item.id, item.score]), [['1', 50], ['2', 0]]);
    assert.equal(output.details.messages, 'Private checker expected output');
    assert(!JSON.stringify(output).includes('private stack'));
    assert.deepEqual(record, before);
});

test('compilation labels distinguish waiting, running, CE, interpreted languages and unconfirmed outcomes', () => {
    const state = (status: number, compile?: boolean) => submissionResult({ status }, false, compile).compilation.text;
    assert.equal(state(0, true), 'not started');
    assert.equal(state(22, true), 'not started');
    assert.equal(state(21, true), 'in progress');
    assert.equal(state(7, true), 'failed');
    for (const status of [1, 2, 3, 4, 5, 6, 11, 20]) {
        assert.equal(state(status, true), 'successful');
        assert.equal(state(status, false), 'not required');
        assert.equal(state(status), 'not confirmed');
    }
    for (const status of [8, 9, 10, 30, 31, 999]) assert.equal(state(status, true), 'not confirmed');
});

test('zero and unavailable values are distinct and limit results are marked as lower bounds', () => {
    const output = submissionResult({
        status: 20,
        score: 0,
        time: 0,
        memory: 0,
        progress: 150,
        testCases: [
            { status: 3, time: 1000, memory: 0, score: 0 },
            { status: 4, time: NaN, memory: -1 },
            { status: 5 },
        ],
    }, true, true);
    assert.ok('details' in output);
    assert.equal(output.details.score, 0);
    assert.equal(output.details.totalTime, '0 ms');
    assert.equal(output.details.peakMemory, '0 B');
    assert.equal(output.details.progress, 100);
    assert.equal(output.details.cases[0].score, 0);
    assert.deepEqual(output.details.cases.map((item) => item.id), [1, 2, 3]);
    assert.equal(output.details.cases[1].time, '—');
    assert.equal(output.details.cases[1].memory, '—');
    assert.equal(output.details.cases[1].score, null);
    assert(output.details.cases.every((item) => item.atLeast));
});

test('empty pending and cancelled records do not invent a testcase, resource measurement or judged time', () => {
    for (const status of [0, 9, 22]) {
        const output = submissionResult({ status, judgeAt: new Date(NaN) }, true, true);
        assert.ok('details' in output);
        assert.equal(output.details.cases.length, 0);
        assert.equal(output.details.subtasks.length, 0);
        assert.equal(output.details.totalTime, '—');
        assert.equal(output.details.peakTime, '—');
        assert.equal(output.details.peakMemory, '—');
        assert.equal(output.details.judgedAt, '');
    }
});

test('structured judge messages interpolate literal parameters and remove terminal escape codes without exporting stacks', () => {
    assert.equal(judgeMessage({ message: 'Line {0}: {1}; missing {2}', params: ['2', '$&<script>'], stack: 'secret' }),
        'Line 2: $&<script>; missing {2}');
    assert.equal(judgeMessage('\u001B[31merror\u001B[0m'), 'error');
    assert.equal(judgeMessage(), '');
});
