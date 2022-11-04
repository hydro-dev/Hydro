import assert from 'assert';
import emojiRegex from 'emoji-regex';
import { isSafeInteger } from 'lodash';
import moment from 'moment-timezone';
import { ObjectID } from 'mongodb';
import saslprep from 'saslprep';
import { Time } from '@hydrooj/utils';
import { ValidationError } from '../error';
import { isContent, isTitle } from '../lib/validator';
import type { Handler } from './server';

type MethodDecorator = (target: any, name: string, obj: any) => any;
type Converter = (value: any) => any;
type Validator = (value: any) => boolean;
export interface ParamOption {
    name: string,
    source: 'all' | 'get' | 'post' | 'route',
    isOptional?: boolean,
    convert?: Converter,
    validate?: Validator,
}

type Type = [Converter, Validator, boolean?];

export interface Types {
    Content: Type,
    Name: Type,
    Username: Type,
    Title: Type,
    String: Type,
    Int: Type,
    UnsignedInt: Type,
    PositiveInt: Type,
    Float: Type,
    ObjectID: Type,
    Boolean: Type,
    Date: Type,
    Time: Type,
    Range: (range: Array<string | number> | Record<string, any>) => Type,
    Array: Type,
    NumericArray: Type,
    CommaSeperatedArray: Type,
    Set: Type,
    Emoji: Type,
}

const safeSaslprep = (v) => {
    try {
        return saslprep(v.toString().trim());
    } catch (e) {
        return '';
    }
};

export const Types: Types = {
    Content: [(v) => v.toString().trim(), isContent],
    Name: [(v) => saslprep(v.toString().trim()), (v) => /^.{1,255}$/.test(safeSaslprep(v))],
    Username: [(v) => saslprep(v.toString().trim()), (v) => /^.{3,31}$/.test(safeSaslprep(v))],
    Title: [(v) => v.toString().trim(), isTitle],
    String: [(v) => v.toString(), null],
    Int: [(v) => parseInt(v, 10), (v) => isSafeInteger(parseInt(v, 10))],
    UnsignedInt: [(v) => parseInt(v, 10), (v) => parseInt(v, 10) >= 0],
    PositiveInt: [(v) => parseInt(v, 10), (v) => parseInt(v, 10) > 0],
    Float: [(v) => +v, (v) => Number.isFinite(+v)],
    // eslint-disable-next-line no-shadow
    ObjectID: [(v) => new ObjectID(v), ObjectID.isValid],
    Boolean: [(v) => !!v, null, true],
    Date: [
        (v) => {
            const d = v.split('-');
            assert(d.length === 3);
            return `${d[0]}-${d[1].length === 1 ? '0' : ''}${d[1]}-${d[2].length === 1 ? '0' : ''}${d[2]}`;
        },
        (v) => {
            const d = v.split('-');
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
            const t = v.split(':');
            if (t.length !== 2) return false;
            return moment(`2020-01-01 ${(t[0].length === 1 ? '0' : '') + t[0]}:${t[1].length === 1 ? '0' : ''}${t[1]}`).isValid();
        },
    ],
    Range: (range) => [
        (v) => {
            if (range instanceof Array) {
                for (const item of range) {
                    if (typeof item === 'number') {
                        if (item === parseInt(v, 10)) return parseInt(v, 10);
                    } else if (item === v) return v;
                }
            }
            return v;
        },
        (v) => {
            if (range instanceof Array) {
                for (const item of range) {
                    if (typeof item === 'string') {
                        if (item === v) return true;
                    } else if (typeof item === 'number') {
                        if (item === parseInt(v, 10)) return true;
                    }
                }
            } else {
                for (const key in range) {
                    if (key === v) return true;
                }
            }
            return false;
        },
    ],
    Array: [(v) => {
        if (v instanceof Array) return v;
        return v ? [v] : [];
    }, null],
    NumericArray: [(v) => {
        if (v instanceof Array) return v.map(Number);
        return v ? [Number(v)] : [];
    }, (v) => {
        if (v instanceof Array) return !v.map(Number).includes(NaN);
        return !Number.isNaN(+v);
    }],
    CommaSeperatedArray: [
        (v) => v.toString().replace(/，/g, ',').split(',').map((e) => e.trim()).filter((i) => i),
        (v) => v.toString(),
    ],
    Set: [(v) => {
        if (v instanceof Array) return new Set(v);
        return v ? new Set([v]) : new Set();
    }, null],
    Emoji: [
        (v: string) => v.matchAll(emojiRegex()).next().value[0],
        (v) => emojiRegex().test(v),
    ],
};

function _buildParam(name: string, source: 'get' | 'post' | 'all' | 'route', ...args: Array<Type | boolean | Validator | Converter>) {
    let cursor = 0;
    const v: ParamOption = { name, source };
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

function _descriptor(v: ParamOption) {
    return function desc(this: Handler, target: any, funcName: string, obj: any) {
        if (!target.__param) target.__param = {};
        if (!target.__param[target.constructor.name]) target.__param[target.constructor.name] = {};
        if (!target.__param[target.constructor.name][funcName]) {
            target.__param[target.constructor.name][funcName] = [{ name: 'domainId', type: 'string', source: 'route' }];
            const originalMethod = obj.value;
            obj.value = function validate(this: Handler, rawArgs: any, ...extra: any[]) {
                if (typeof rawArgs !== 'object' || extra.length) return originalMethod.call(this, rawArgs, ...extra);
                const c = [];
                const arglist: ParamOption[] = this.__param[target.constructor.name][funcName];
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
    ((name: string, type: Type) => MethodDecorator)
    & ((name: string, type: Type, validate: null, convert: Converter) => MethodDecorator)
    & ((name: string, type: Type, validate?: Validator, convert?: Converter) => MethodDecorator)
    & ((name: string, type?: Type, isOptional?: boolean, validate?: Validator, convert?: Converter) => MethodDecorator)
    & ((name: string, ...args: Array<Type | boolean | Validator | Converter>) => MethodDecorator);

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
            redirect: this.ctx.originalUrl,
        };
        this.response.redirect = this.url('user_sudo');
        return 'cleanup';
    };
    return obj;
}
