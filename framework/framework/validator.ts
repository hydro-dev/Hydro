import assert from 'assert';
import emojiRegex from 'emoji-regex';
import sanitize from 'sanitize-filename';
import saslprep from 'saslprep';
import Schema from 'schemastery';

type InputType = string | number | Record<string, any> | any[];
export type Converter<T> = (value: any) => T;
export type Validator<Loose extends boolean = true> = (value: Loose extends true ? any : InputType) => boolean;
export type Type<T> = Schema<T> | readonly [Converter<T>, Validator<false>?, (boolean | 'convert')?];

const MaybeArray = <T>(inner: Schema<T>) => Schema.union([Schema.array(inner), inner]);
type CheckFunction = <IsNumber extends boolean>(v: IsNumber extends true ? number : string) => boolean;
const ArrayBase = <IsNumber extends boolean>(check: CheckFunction, number: IsNumber, doSplit: boolean = number) => Schema.transform(
    MaybeArray(Schema.union([Number, String])),
    (v) => {
        const input = (doSplit && typeof v === 'string') ? v.split(',') : v;
        const res = number
            ? (typeof input === 'string' ? [+input] : typeof input === 'number' ? [input] : input.map(Number))
            : typeof input === 'string' ? [input] : typeof input === 'number' ? [input.toString()] : input.map(String);
        const locate = number
            ? res.find((i) => !Number.isFinite(+i) || !check(+i as any))
            : res.find((i) => !check(i as any));
        if (locate !== undefined) throw new Error(`Invalid input: ${locate}`);
        return res;
    },
) as Schema<any, IsNumber extends true ? number[] : string[]>;

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

export const Types = {
    Content: [(v) => v.toString().trim(), (v) => v?.toString()?.trim() && v.toString().trim().length < 65536],
    Key: saslprepString(/^[\w-]{1,255}$/),
    /** @deprecated */
    Name: saslprepString(/^.{1,255}$/),
    Filename: saslprepString(/^[^\\/?#~!|*]{1,255}$/, (i) => sanitize(i) === i),
    UidOrName: saslprepString(/^(?:.{3,31}|[\u4E00-\u9FA5]{2}|-?[0-9]+)$/),
    Username: saslprepString(/^(?:.{3,31}|[\u4E00-\u9FA5]{2})$/),
    Password: basicString(/^.{6,255}$/),
    ProblemId: saslprepString(/^(?:[a-z0-9]{1,10}-)?[a-z0-9]+$/i, () => true, (s) => (Number.isSafeInteger(+s) ? +s : s)),
    Email: saslprepString(/^[\w.+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i),
    DomainId: saslprepString(/^[a-zA-Z]\w{3,31}$/),
    Role: saslprepString(/^[\w\u4E00-\u9FA5]{1,31}$/),
    Title: basicString(/^.{1,64}$/, (i) => !!i.trim()),
    ShortString: basicString(/^.{1,255}$/),
    String: basicString(),

    Int: [(v) => +v, (v) => /^[+-]?[0-9]+$/.test(v.toString().trim()) && Number.isSafeInteger(+v)],
    UnsignedInt: [(v) => +v, (v) => /^(?:-0|\+?[0-9]+)$/.test(v.toString().trim()) && Number.isSafeInteger(+v)],
    PositiveInt: [(v) => +v, (v) => /^\+?[1-9][0-9]*$/.test(v.toString().trim()) && Number.isSafeInteger(+v)],
    Float: [(v) => +v, (v) => Number.isFinite(+v)],

    ObjectId: [() => { throw new Error('mongodb package not found'); }, () => true],
    Boolean: [(v) => !!(v && !['false', 'off', 'no', '0'].includes(v)), null, true],
    Date: [
        (v) => {
            const d = v.split('-');
            assert(d.length === 3);
            assert(d[0].length === 4);
            return `${d[0]}-${d[1].length === 1 ? '0' : ''}${d[1]}-${d[2].length === 1 ? '0' : ''}${d[2]}`;
        },
        (v) => {
            const d = v.toString().split('-');
            if (d.length !== 3) return false;
            if (d[0].length !== 4) return false;
            const st = `${d[0]}-${d[1].length === 1 ? '0' : ''}${d[1]}-${d[2].length === 1 ? '0' : ''}${d[2]}`;
            return Number.isFinite(new Date(st).getTime());
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
            const d = new Date(`2020-01-01 ${(t[0].length === 1 ? '0' : '') + t[0]}:${t[1].length === 1 ? '0' : ''}${t[1]}`);
            return Number.isFinite(d.getTime());
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
    NumericArray: ArrayBase(Number.isFinite, true),
    CommaSeperatedArray: ArrayBase(() => true, false, true),
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
} satisfies Types;

try {
    const { ObjectId } = require('mongodb');
    Types.ObjectId = [((v) => new ObjectId(v)) as any, ObjectId.isValid];
} catch (e) {

}

// @ts-ignore
Types.ObjectID = Types.ObjectId;
// backward compatibility
