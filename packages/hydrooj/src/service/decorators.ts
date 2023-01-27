import assert from 'assert';
import emojiRegex from 'emoji-regex';
import { isSafeInteger } from 'lodash';
import moment from 'moment-timezone';
import { ObjectID } from 'mongodb';
import saslprep from 'saslprep';
import { Time } from '@hydrooj/utils';
import { ValidationError } from '../error';
import type { Handler } from './server';

type MethodDecorator = (target: any, name: string, obj: any) => any;
type InputType = string | number | Record<string, any> | any[];
type Converter<T> = (value: any) => T;
type Validator<Loose extends boolean = true> = (value: Loose extends true ? any : InputType) => boolean;
export interface ParamOption<T> {
    name: string,
    source: 'all' | 'get' | 'post' | 'route',
    isOptional?: boolean,
    convert?: Converter<T>,
    validate?: Validator,
}

type Type<T> = readonly [Converter<T>, Validator<false>?, boolean?];

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
    String: Type<string>;

    // Number outputs
    Int: Type<number>;
    UnsignedInt: Type<number>;
    PositiveInt: Type<number>;
    Float: Type<number>;

    // Other
    ObjectID: Type<ObjectID>;
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
    Content: [(v) => v.toString().trim(), (v) => v && v.toString().trim().length < 65536],
    Key: saslprepString(/^[a-zA-Z0-9-_]+$/),
    /** @deprecated */
    Name: saslprepString(/^.{1,255}$/),
    Filename: saslprepString(/^[^.\\/?#~]{1,255}$/, (i) => !['con', '.', '..'].includes(i)),
    UidOrName: saslprepString(/^(.{3,31}|[\u4e00-\u9fa5]{2}|-?[0-9]+)$/),
    Username: saslprepString(/^(.{3,31}|[\u4e00-\u9fa5]{2})$/),
    Password: saslprepString(/^.{6,255}$/),
    ProblemId: saslprepString(/^[a-zA-Z]+[a-zA-Z0-9]*$/i, () => true, (s) => (Number.isSafeInteger(+s) ? +s : s)),
    Email: saslprepString(/^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/i),
    DomainId: saslprepString(/^[a-zA-Z][a-zA-Z0-9_]{3,31}$/),
    Role: saslprepString(/^[_0-9A-Za-z\u4e00-\u9fa5]{1,31}$/i),
    Title: saslprepString(/^.{1,64}$/),
    String: [(v) => v.toString(), null],

    Int: [(v) => +v, (v) => /^[+-]?[0-9]+$/.test(v.toString().trim()) && isSafeInteger(+v)],
    UnsignedInt: [(v) => +v, (v) => /^(-0|\+?[0-9]+)$/.test(v.toString().trim()) && isSafeInteger(+v)],
    PositiveInt: [(v) => +v, (v) => /^\+?[1-9][0-9]*$/.test(v.toString().trim()) && isSafeInteger(+v)],
    Float: [(v) => +v, (v) => Number.isFinite(+v)],

    ObjectID: [(v) => new ObjectID(v), ObjectID.isValid],
    Boolean: [(v) => v && !['false', 'off'].includes(v), null, true],
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

function _buildParam(name: string, source: 'get' | 'post' | 'all' | 'route', ...args: Array<Type<any> | boolean | Validator | Converter<any>>) {
    let cursor = 0;
    const v: ParamOption<any> = { name, source };
    let isValidate = true;
    while (cursor < args.length) {
        const current = args[cursor];
        if (current instanceof Array) {
            const type = current;
            if (type[0]) v.convert = type[0];
            if (type[1]) v.validate = type[1];
            if (type[2]) v.isOptional = type[2];
        } else if (typeof current === 'boolean') v.isOptional = current;
        else if (isValidate) {
            if (current !== null) v.validate = current;
            isValidate = false;
        } else v.convert = current;
        cursor++;
    }
    return v;
}

function _descriptor(v: ParamOption<any>) {
    return function desc(this: Handler, target: any, funcName: string, obj: any) {
        target.__param ||= {};
        target.__param[target.constructor.name] ||= {};
        if (!target.__param[target.constructor.name][funcName]) {
            target.__param[target.constructor.name][funcName] = [{ name: 'domainId', type: 'string', source: 'route' }];
            const originalMethod = obj.value;
            obj.value = function validate(this: Handler, rawArgs: any, ...extra: any[]) {
                if (typeof rawArgs !== 'object' || extra.length) return originalMethod.call(this, rawArgs, ...extra);
                const c = [];
                const arglist: ParamOption<any>[] = this.__param[target.constructor.name][funcName];
                for (const item of arglist) {
                    const src = item.source === 'all'
                        ? rawArgs
                        : item.source === 'get'
                            ? this.request.query
                            : item.source === 'route'
                                ? { ...this.request.params, domainId: this.args.domainId }
                                : this.request.body;
                    const value = src[item.name];
                    if (!item.isOptional || value) {
                        if (value === undefined || value === null || value === '') throw new ValidationError(item.name);
                        if (item.validate && !item.validate(value)) throw new ValidationError(item.name);
                        if (item.convert) c.push(item.convert(value));
                        else c.push(value);
                    } else c.push(undefined);
                }
                return originalMethod.call(this, ...c);
            };
        }
        target.__param[target.constructor.name][funcName].splice(1, 0, v);
        return obj;
    };
}

type DescriptorBuilder =
    ((name: string, type: Type<any>) => MethodDecorator)
    & ((name: string, type: Type<any>, validate: null, convert: Converter<any>) => MethodDecorator)
    & ((name: string, type: Type<any>, validate?: Validator, convert?: Converter<any>) => MethodDecorator)
    & ((name: string, type?: Type<any>, isOptional?: boolean, validate?: Validator, convert?: Converter<any>) => MethodDecorator)
    & ((name: string, ...args: Array<Type<any> | boolean | Validator | Converter<any>>) => MethodDecorator);

export const get: DescriptorBuilder = (name, ...args) => _descriptor(_buildParam(name, 'get', ...args));
export const query: DescriptorBuilder = (name, ...args) => _descriptor(_buildParam(name, 'get', ...args));
export const post: DescriptorBuilder = (name, ...args) => _descriptor(_buildParam(name, 'post', ...args));
export const route: DescriptorBuilder = (name, ...args) => _descriptor(_buildParam(name, 'route', ...args));
export const param: DescriptorBuilder = (name, ...args) => _descriptor(_buildParam(name, 'all', ...args));

export function requireSudo(target: any, funcName: string, obj: any) {
    const originalMethod = obj.value;
    obj.value = function sudo(this: Handler, ...args: any[]) {
        if (this.session.sudo && Date.now() - this.session.sudo < Time.hour) {
            if (this.session.sudoArgs?.referer) this.request.headers.referer = this.session.sudoArgs.referer;
            this.session.sudoArgs = null;
            return originalMethod.call(this, ...args);
        }
        this.session.sudoArgs = {
            method: this.request.method,
            referer: this.request.headers.referer,
            args: this.args,
            redirect: this.request.originalPath,
        };
        this.response.redirect = this.url('user_sudo');
        return 'cleanup';
    };
    return obj;
}
