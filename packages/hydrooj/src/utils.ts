import { isNullable } from 'cosmokit';

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

export * from '@hydrooj/utils/lib/utils';
