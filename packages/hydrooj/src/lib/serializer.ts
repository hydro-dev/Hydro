interface SerializeOptions {
    showDisplayName: boolean;
    currentSerializer?: (k: string, v: any) => any;
}

export default function serializer(options: SerializeOptions, ignoreSerializeFunction = false) {
    options.currentSerializer = (k: string, v: any) => {
        if (typeof k.startsWith !== 'function') console.log(k, v);
        if (k.startsWith('_') && k !== '_id') return undefined;
        if (typeof v === 'bigint') return `BigInt::${v.toString()}`;
        if (!ignoreSerializeFunction && v && typeof v === 'object'
            && 'serialize' in v && typeof v.serialize === 'function') return v.serialize(options);
        return v;
    };
    return options.currentSerializer;
}
