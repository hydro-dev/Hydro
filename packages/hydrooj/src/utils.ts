import { isNullable } from 'cosmokit';
import { Service } from './context';

export function buildProjection<T extends string | number = string>(fields: readonly T[]): Record<T, true> {
    const o: Record<T, true> = Object.create(null);
    for (const k of fields) o[k] = true;
    return o;
}

export const log2 = (val: bigint | number) => {
    if (typeof val === 'bigint') {
        for (let i = 0n; ; i++) if (!(val >> i)) return +i.toString() - 1;
    } else {
        for (let i = 0; ; i++) if (!(val >> i)) return i - 1;
    }
};

export function ArgMethod(target: any, funcName: string, obj: any) {
    return obj;
}

export function unwrapExports(module: any) {
    if (isNullable(module)) return module;
    if (typeof module !== 'object') return module;
    if ('apply' in module && typeof module.apply === 'function') return module;
    // https://github.com/evanw/esbuild/issues/2623
    // https://esbuild.github.io/content-types/#default-interop
    if (!module.__esModule) return module;
    return module.default ?? module;
}

// EXPERIMENTAL: This function is subject to change
// Don't try to understand this wrapper
export function serviceInstance<T extends new (...args: any[]) => any>(ImplClass: T) {
    let instance: any = null;
    let state: 'pending' | 'initializing' | 'initialized' = 'pending';
    const onClass: (symbol | string)[] = ['name', 'Config', 'inject', 'prototype'];
    const name = ImplClass.name;

    const proxyObj = new Proxy(ImplClass, {
        get(_, key) {
            if (key === 'Service') return proxyObj;
            if (Reflect.has(ImplClass, key) || onClass.includes(key)) return Reflect.get(ImplClass, key);
            if (state === 'pending') throw new Error(`${name} is not initialized yet (getting ${String(key)})`);
            if (state === 'initializing') throw new Error(`${name} is still initializing (getting ${String(key)})`);
            return Reflect.get(instance, key);
        },
        has(_, key) {
            if (key === Symbol.for('hydro.initialize')) return state !== 'pending';
            return Reflect.has(_, key);
        },
        construct(_, args, target) {
            if (state !== 'pending') throw new Error(`${name} is already constructed`);
            state = 'initializing';
            const originalInit = ImplClass.prototype[Service.init];
            if (originalInit) {
                ImplClass.prototype[Service.init] = new Proxy(originalInit, {
                    apply(...applyArgs) {
                        const result = Reflect.apply(...applyArgs);
                        if (result instanceof Promise) result.then(() => { state = 'initialized'; });
                        else state = 'initialized';
                        return result;
                    },
                });
            }
            instance = Reflect.construct(ImplClass, args, target);
            if (!Reflect.has(ImplClass, Service.init)) state = 'initialized';
            return instance;
        },
    }) as (T extends (new (...args: any[]) => infer R) ? (R & { Service: (new (...args: any[]) => R) }) : never);
    return proxyObj;
}

export * from '@hydrooj/utils/lib/utils';
