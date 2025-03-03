import type { HandlerCommon } from './server';
import type { Context } from '@cordisjs/core';

export default function serializer<T extends Context>(ignoreSerializeFunction = false, h?: HandlerCommon<T>) {
    return (k: string, v: any) => {
        if (k.startsWith('_') && k !== '_id') return undefined;
        if (typeof v === 'bigint') return `BigInt::${v.toString()}`;
        if (!ignoreSerializeFunction && v && typeof v === 'object'
            && 'serialize' in v && typeof v.serialize === 'function') return v.serialize(h);
        return v;
    };
}
