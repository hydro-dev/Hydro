import { expect } from 'chai';
import { describe, it } from 'node:test';
import { Types } from '../validator';

const k = Symbol.for('schemastery');

describe('validator', () => {
    it('NumericArray', () => {
        expect(Types.NumericArray('1,2,3')).to.deep.equal([1, 2, 3]);
        expect(Types.NumericArray([1, 2, 3])).to.deep.equal([1, 2, 3]);
        expect(() => Types.NumericArray('123a')).to.throw();
    });

    it('CommaSeperatedArray', () => {
        expect(Types.CommaSeperatedArray('1,2,3')).to.deep.equal(['1', '2', '3']);
        expect(Types.CommaSeperatedArray([1, 2, 3])).to.deep.equal(['1', '2', '3']);
        expect(Types.CommaSeperatedArray('123a')).to.deep.equal(['123a']);
        expect(k in Types.CommaSeperatedArray).to.eq(true);
    });
});
