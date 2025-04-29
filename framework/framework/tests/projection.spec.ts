import { expect } from 'chai';
import { describe, it } from 'node:test';
import { projection } from '../api';

const input = {
    foo: 1,
    bar: 'string',
    arr: [
        { sub: 1, another: 'key' },
        { sub: 2 },
    ],
    obj: {
        sub: 3,
    },
};

describe('projection', () => {
    it('pick', () => {
        expect(projection(input, { foo: 1, bar: 1 })).to.deep.equal({ foo: 1, bar: 'string' });
    });
    it('array', () => {
        expect(projection(input, { arr: { sub: 1 } })).to.deep.equal({ arr: [{ sub: 1 }, { sub: 2 }] });
    });
    it('non-exist', () => {
        expect(projection(input, { 'non-exist': 1 })).to.deep.equal({});
    });
    it('partial', () => {
        expect(projection(input, { arr: { sub: 1, another: 1 } })).to.deep.equal({ arr: [{ sub: 1, another: 'key' }, { sub: 2 }] });
    });
    it('object', () => {
        expect(projection(input, { obj: { sub: 1 } })).to.deep.equal({ obj: { sub: 3 } });
    });
});
describe('safety', () => {
    it('prototype', () => {
        // eslint-disable-next-line
        expect(projection({}, { __proto__: 1 })).to.deep.equal({});
        expect(projection({}, { prototype: 1 })).to.deep.equal({});
    });
    it('circular', () => {
        const circular = {};
        // @ts-ignore
        circular.circular = circular;
        expect(projection(circular, { circular: 1 })).to.deep.equal({ circular });
    });
});
