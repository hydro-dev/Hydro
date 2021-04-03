import cluster from 'cluster';
import type { Logger } from './logger';

if (!cluster.worker) {
    // @ts-ignore
    cluster.worker = { id: 0 };
}

export function buildProjection(fields: string[]): Record<string, 1> {
    const o = {};
    for (const k of fields) o[k] = 1;
    return o;
}

export const log2 = (val: bigint | number) => {
    if (typeof val === 'bigint') {
        // @ts-ignore
        for (let i = 0n; ; i++) if (!(val >> i)) return +i.toString() - 1;
    } else {
        for (let i = 0; ; i++) if (!(val >> i)) return i - 1;
    }
};

export function ArgMethod(target: any, funcName: string, obj: any) {
    return obj;
}

export function logAndReturn(logger: Logger) {
    return function cb(err: Error) {
        logger.error(err);
        return err;
    };
}

export * from '@hydrooj/utils/lib/utils';
