import type { HandlerCommon } from './server';

export default function serializer(ignoreSerializeFunction = false, h?: HandlerCommon) {
    return (k: string, v: any) => {
        if (k.startsWith('_') && k !== '_id') return undefined;
        if (typeof v === 'bigint') return `BigInt::${v.toString()}`;
        if (!ignoreSerializeFunction && v && typeof v === 'object'
            && 'serialize' in v && typeof v.serialize === 'function') return v.serialize(h);
        return v;
    };
}
