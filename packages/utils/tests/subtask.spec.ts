import { expect } from 'chai';
import { describe, it } from 'node:test';
import { readSubtasksFromFiles } from '../lib/common';

interface Info {
    subtask: number;
    id: number;
}

function shouldFindTestcase(files: string[], info?: Info) {
    const subtasks = readSubtasksFromFiles(files, {});
    if (files.includes('a2_1.in')) console.log(subtasks);
    expect(subtasks).to.be.lengthOf(1);
    if (info?.subtask) expect(subtasks[0].id).to.equal(info.subtask);
    const cases = subtasks.map((i) => i.cases).flat();
    expect(cases).to.be.lengthOf(1);
    if (info?.id) expect(cases[0].id).to.deep.equal(info.id);
}

describe('single case', () => {
    it('1.in/1.out', () => {
        shouldFindTestcase(['1.in', '1.out']);
    });
    it('1.in/2.ans', () => {
        shouldFindTestcase(['1.in', '1.ans']);
    });
    it('file1.in/file1.out', () => {
        shouldFindTestcase(['file1.in', 'file1.out']);
    });
    it('file.in1/file.ou1', () => {
        shouldFindTestcase(['file.in1', 'file.ou1']);
    });
    it('input1.txt/output1.txt', () => {
        shouldFindTestcase(['input1.txt', 'output1.txt']);
    });
    it('data.1.in/data.1.out', () => {
        shouldFindTestcase(['data.1.in', 'data.1.out']);
    });
});
describe('subtask', () => {
    it('1_1.in/1_1.out', () => {
        shouldFindTestcase(['1_1.in', '1_1.out'], { subtask: 1, id: 1 });
    });
    it('a1_1.in/a1_1.out', () => {
        shouldFindTestcase(['a1_1.in', 'a1_1.out'], { subtask: 1, id: 1 });
    });
    it('a01_01.in/a01_01.out', () => {
        shouldFindTestcase(['a01_01.in', 'a01_01.out'], { subtask: 1, id: 1 });
    });
    it('1-1.in/1-1.out', () => {
        shouldFindTestcase(['1-1.in', '1-1.out'], { subtask: 1, id: 1 });
    });
    it('a1-1.in/a1-1.out', () => {
        shouldFindTestcase(['a1-1.in', 'a1-1.out'], { subtask: 1, id: 1 });
    });
    it('subtask_1_1.in/subtask_1_1.out', () => {
        shouldFindTestcase(['subtask_1_1.in', 'subtask_1_1.out'], { subtask: 1, id: 1 });
    });
    it('01sample-01.in/01sample-01.out', () => {
        shouldFindTestcase(['01sample-01.in', '01sample-01.out'], { subtask: 1, id: 1 });
    });
});
