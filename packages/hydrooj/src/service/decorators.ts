import { Time } from '@hydrooj/utils';
import { ValidationError } from '../error';
import { Converter, Type, Validator } from '../lib/validator';
import { EventMap } from './bus';
import type { Handler } from './server';

type MethodDecorator = (target: any, funcName: string, obj: any) => any;
type ClassDecorator = <T extends new (...args: any[]) => any>(Class: T) => T extends new (...args: infer R) => infer S
    ? new (...args: R) => S : never;
export interface ParamOption<T> {
    name: string,
    source: 'all' | 'get' | 'post' | 'route',
    isOptional?: boolean | 'convert',
    convert?: Converter<T>,
    validate?: Validator,
}

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
            const originalMethod = obj.value;
            const val = originalMethod.toString();
            const firstArg = val.split(')')[0]?.split(',')[0]?.split('(')[1]?.trim() || '';
            const domainIdStyle = firstArg.toLowerCase().includes('domainid');
            target.__param[target.constructor.name][funcName] = [];
            obj.value = function validate(this: Handler, rawArgs: any, ...extra: any[]) {
                if (typeof rawArgs !== 'object' || extra.length) return originalMethod.call(this, rawArgs, ...extra);
                const c = [];
                const arglist: ParamOption<any>[] = target.__param[target.constructor.name][funcName];
                if (typeof rawArgs.domainId !== 'string' || !rawArgs.domainId) throw new ValidationError('domainId');
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
                    } else if (item.isOptional === 'convert') {
                        c.push(item.convert ? item.convert(value) : value);
                    } else c.push(undefined);
                }
                return domainIdStyle ? originalMethod.call(this, rawArgs.domainId, ...c) : originalMethod.call(this, rawArgs, ...c);
            };
        }
        target.__param[target.constructor.name][funcName].unshift(v);
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

export const subscribe: (name: keyof EventMap) => MethodDecorator & ClassDecorator = (name) => (target, funcName?, obj?) => {
    if (funcName) {
        target.__subscribe ||= [];
        target.__subscribe.push({ name, target: obj.value });
        return obj;
    }
    return (...args) => {
        const c = new target(...args); // eslint-disable-line new-cap
        c.__subscribe = [{ name, target: c.send }];
        return c;
    };
};

/*
 * For security concern, some API requires sudo privilege to access.
 * And for some superadmin operations,
 * we do not allow them using a password to perform the sudo operation,
 * as most user choose to use "remember password" option.
 * When teachers are using a superuser account, accessing from classrooms,
 * it may lead to serious security issues.
 * !!! Please make sure that all superuser accounts have two factor authentication enabled. !!!
 */
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
