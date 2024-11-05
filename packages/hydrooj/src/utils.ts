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
    return (!module || typeof module !== 'object') ? module
        : 'apply' in module && typeof module.apply === 'function' ? module
            : 'default' in module ? module.default : module;
}

export * from '@hydrooj/utils/lib/utils';
