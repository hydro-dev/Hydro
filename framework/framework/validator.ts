import assert from 'assert';
import emojiRegex from 'emoji-regex';
import { isSafeInteger } from 'lodash';
import moment from 'moment-timezone';
import sanitize from 'sanitize-filename';
import saslprep from 'saslprep';

type InputType = string | number | Record<string, any> | any[];
export type Converter<T> = (value: any) => T;
export type Validator<Loose extends boolean = true> = (value: Loose extends true ? any : InputType) => boolean;
export type Type<T> = readonly [Converter<T>, Validator<false>?, (boolean | 'convert')?];

export interface Types {
    // String outputs
    Content: Type<string>;
    Key: Type<string>;
    /** @deprecated */
    Name: Type<string>;
    Username: Type<string>;
    Password: Type<string>;
    UidOrName: Type<string>;
    Email: Type<string>;
    Filename: Type<string>;
    DomainId: Type<string>;
    ProblemId: Type<string | number>;
    Role: Type<string>;
    Title: Type<string>;
    Emoji: Type<string>;
    ShortString: Type<string>;
    String: Type<string>;

    // Number outputs
    Int: Type<number>;
    UnsignedInt: Type<number>;
    PositiveInt: Type<number>;
    Float: Type<number>;

    // Other
    ObjectId: Type<typeof import('mongodb').ObjectId>;
    Boolean: Type<boolean>;
    Date: Type<string>;
    Time: Type<string>;
    Range: <T extends string | number>(range: Array<T> | Record<string, any>) => Type<T>;
    /** @deprecated */
    Array: Type<any[]>;
    NumericArray: Type<number[]>;
    CommaSeperatedArray: Type<string[]>;
    Set: Type<Set<any>>;
    Any: Type<any>;
    ArrayOf: <T extends Type<any>>(type: T) => (T extends Type<infer R> ? Type<R[]> : never);
    AnyOf: <T extends Type<any>>(...type: T[]) => (T extends Type<infer R> ? Type<R> : never);
}

const basicString = <T = string>(regex?: RegExp, cb?: (i: string) => boolean, convert?: (i: string) => T) => [
    convert || ((v) => v.toString()),
    (v) => {
        const res = v.toString();
        if (regex && !regex.test(res)) return false;
        if (cb && !cb(res)) return false;
        return !!res.length;
    },
] as [(v) => string, (v) => boolean];
const saslprepString = <T = string>(regex?: RegExp, cb?: (i: string) => boolean, convert?: (i: string) => T) => [
    convert || ((v) => saslprep(v.toString().trim())),
    (v) => {
        try {
            const res = saslprep(v.toString().trim());
            if (regex && !regex.test(res)) return false;
            if (cb && !cb(res)) return false;
            return !!res.length;
        } catch (e) {
            return false;
        }
    },
] as [(v) => string, (v) => boolean];

export const Types: Types = {
    Content: [(v) => v.toString().trim(), (v) => v?.toString()?.trim() && v.toString().trim().length < 65536],
    Key: saslprepString(/^[a-zA-Z0-9-_]{1,255}$/),
    /** @deprecated */
    Name: saslprepString(/^.{1,255}$/),
    Filename: saslprepString(/^[^\\/?#~!|*]{1,255}$/, (i) => sanitize(i) === i),
    UidOrName: saslprepString(/^(.{3,31}|[\u4e00-\u9fa5]{2}|-?[0-9]+)$/),
    Username: saslprepString(/^(.{3,31}|[\u4e00-\u9fa5]{2})$/),
    Password: basicString(/^.{6,255}$/),
    ProblemId: saslprepString(/^([a-zA-Z0-9]{1,10}-)?[a-zA-Z0-9]+$/i, () => true, (s) => (Number.isSafeInteger(+s) ? +s : s)),
    Email: saslprepString(/^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/i),
    DomainId: saslprepString(/^[a-zA-Z][a-zA-Z0-9_]{3,31}$/),
    Role: saslprepString(/^[_0-9A-Za-z\u4e00-\u9fa5]{1,31}$/i),
    Title: basicString(/^.{1,64}$/, (i) => !!i.trim()),
    ShortString: basicString(/^.{1,255}$/),
    String: basicString(),

    Int: [(v) => +v, (v) => /^[+-]?[0-9]+$/.test(v.toString().trim()) && isSafeInteger(+v)],
    UnsignedInt: [(v) => +v, (v) => /^(-0|\+?[0-9]+)$/.test(v.toString().trim()) && isSafeInteger(+v)],
    PositiveInt: [(v) => +v, (v) => /^\+?[1-9][0-9]*$/.test(v.toString().trim()) && isSafeInteger(+v)],
    Float: [(v) => +v, (v) => Number.isFinite(+v)],

    ObjectId: [() => { throw new Error('mongodb package not found'); }, () => true],
    Boolean: [(v) => !!(v && !['false', 'off'].includes(v)), null, true],
    Date: [
        (v) => {
            const d = v.split('-');
            assert(d.length === 3);
            return `${d[0]}-${d[1].length === 1 ? '0' : ''}${d[1]}-${d[2].length === 1 ? '0' : ''}${d[2]}`;
        },
        (v) => {
            const d = v.toString().split('-');
            if (d.length !== 3) return false;
            const st = `${d[0]}-${d[1].length === 1 ? '0' : ''}${d[1]}-${d[2].length === 1 ? '0' : ''}${d[2]}`;
            return moment(st).isValid();
        },
    ],
    Time: [
        (v) => {
            const t = v.split(':');
            assert(t.length === 2);
            return `${(t[0].length === 1 ? '0' : '') + t[0]}:${t[1].length === 1 ? '0' : ''}${t[1]}`;
        },
        (v) => {
            const t = v.toString().split(':');
            if (t.length !== 2) return false;
            return moment(`2020-01-01 ${(t[0].length === 1 ? '0' : '') + t[0]}:${t[1].length === 1 ? '0' : ''}${t[1]}`).isValid();
        },
    ],
    Range: (range) => [
        (v) => {
            if (range instanceof Array) {
                for (const item of range) {
                    if (typeof item === 'number' && item === +v) return +v;
                    if (item === v) return v;
                }
            }
            return v;
        },
        (v) => {
            if (range instanceof Array) {
                for (const item of range) {
                    if (typeof item === 'string' && item === v) return true;
                    if (typeof item === 'number' && item === +v) return true;
                }
            } else {
                for (const key in range) {
                    if (key === v) return true;
                }
            }
            return false;
        },
    ],
    /** @deprecated suggested to use Types.ArrayOf instead. */
    Array: [(v) => {
        if (v instanceof Array) return v;
        return v ? [v] : [];
    }, null],
    NumericArray: [(v) => {
        if (v instanceof Array) return v.map(Number);
        return v.split(',').map(Number);
    }, (v) => {
        if (v instanceof Array) return v.map(Number).every(Number.isSafeInteger);
        return v.toString().split(',').map(Number).every(Number.isSafeInteger);
    }],
    CommaSeperatedArray: [
        (v) => v.toString().replace(/，/g, ',').split(',').map((e) => e.trim()).filter((i) => i),
        (v) => !!v.toString(),
    ],
    Set: [(v) => {
        if (v instanceof Array) return new Set(v);
        return v ? new Set([v]) : new Set();
    }, null],
    Emoji: [
        (v: string) => v.matchAll(emojiRegex()).next().value[0],
        (v) => emojiRegex().test(v.toString()),
    ],
    Any: [(v) => v, null],
    ArrayOf: (type) => [
        (v) => {
            const arr = v instanceof Array ? v : [v];
            return arr.map((i) => type[0](i));
        },
        (v) => {
            if (!type[1]) return true;
            const arr = v instanceof Array ? v : [v];
            return arr.every((i) => type[1](i));
        },
    ] as any,
    AnyOf: (...types) => [
        (v) => types.find((type) => type[1](v))[0](v),
        (v) => types.some((type) => type[1](v)),
    ] as any,
};

try {
    const { ObjectId } = require('mongodb');
    Types.ObjectId = [(v) => new ObjectId(v), ObjectId.isValid];
} catch (e) {

}

// @ts-ignore
Types.ObjectID = Types.ObjectId;
// backward compatibility
