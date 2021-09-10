import 'hydrooj/src/loader';

import * as utils from 'hydrooj/src/utils';

describe('Utils', () => {
    test('Array.isDiff', () => {
        expect(Array.isDiff([1], [2])).toBeTruthy();
        expect(Array.isDiff([1, 2, 3], [1, 2])).toBeTruthy();
        expect(Array.isDiff(['1'], [1])).toBeTruthy();
        expect(Array.isDiff(['2'], [])).toBeTruthy();
        expect(Array.isDiff([1], [1])).toBeFalsy();
        expect(Array.isDiff([1, 2], [2, 1])).toBeFalsy();
    });

    test('Date.format', () => {
        const date = new Date('1926-08-17 00:00:00');
        expect(date.format()).toStrictEqual('1926-08-17 00:00:00');
        expect(date.format('%Y-%m+%d')).toStrictEqual('1926-08+17');
    });

    test('Math.sum', () => {
        expect(Math.sum(1, 2, 3)).toStrictEqual(6);
        expect(Math.sum([1, 2], 3)).toStrictEqual(6);
        expect(Math.sum(-1, 2, 3)).toStrictEqual(4);
        expect(Math.sum()).toStrictEqual(0);
    });

    test('Set.isSuperset', () => {
        const setA = new Set([1, 2, 3]);
        const setB = new Set([1]);
        const setC = new Set([2]);
        const setD = new Set();
        expect(Set.isSuperset(setA, setA)).toBeTruthy();
        expect(Set.isSuperset(setA, setB)).toBeTruthy();
        expect(Set.isSuperset(setB, setA)).toBeFalsy();
        expect(Set.isSuperset(setB, setC)).toBeFalsy();
        expect(Set.isSuperset(setA, setD)).toBeTruthy();
    });

    test('Set.union', () => {
        const setA = new Set([1, 2, 3]);
        const setB = new Set([2]);
        const setC = new Set([4]);
        const setD = new Set([1, 2, 3, 4]);
        expect(Set.union(setA, setB)).toStrictEqual(setA);
        expect(Set.union(setA, setC)).toStrictEqual(setD);
    });

    test('Set.intersection', () => {
        const setA = new Set([1, 2, 3]);
        const setB = new Set([2]);
        const setC = new Set([4]);
        const setD = new Set();
        expect(Set.intersection(setA, setB)).toStrictEqual(setB);
        expect(Set.intersection(setA, setC)).toStrictEqual(setD);
        expect(Set.intersection(setA, setD)).toStrictEqual(setD);
    });

    test('parseTimeMs', () => {
        expect(utils.parseTimeMS('1000ms')).toStrictEqual(1000);
        expect(utils.parseTimeMS('1s')).toStrictEqual(1000);
        expect(utils.parseTimeMS('1.5s')).toStrictEqual(1500);
        expect(utils.parseTimeMS('13000us')).toStrictEqual(13);
    });

    test('parseMemoryMB', () => {
        expect(utils.parseMemoryMB('1mb')).toStrictEqual(1);
        expect(utils.parseMemoryMB('10kb')).toStrictEqual(1);
        expect(utils.parseMemoryMB('0.2g')).toStrictEqual(205);
    });

    test('isClass', () => {
        const classA = class { };
        const classB = function a() { };
        classB.prototype.get = function a() { return 1; };
        const funcA = function a() { };
        expect(utils.isClass(classA)).toBeTruthy();
        expect(utils.isClass(classB)).toBeTruthy();
        expect(utils.isClass(funcA)).toBeFalsy();
    });
});
