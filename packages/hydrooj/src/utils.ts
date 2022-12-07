export function buildProjection(fields: readonly (string | number)[]): Record<string, 1> {
    const o = {};
    for (const k of fields) o[k] = 1;
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
