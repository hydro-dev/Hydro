import Lru from 'lru-cache';
import { NumberKeys, SystemKeys } from '../interface';
import * as db from '../service/db';

const coll = db.collection('system');

const cache = new Lru<string, any>({
    maxAge: 5000,
});

export async function get<K extends keyof SystemKeys>(_id: K): Promise<SystemKeys[K]> {
    const res = cache.get(_id);
    if (res !== undefined) return res;
    const doc = await coll.findOne({ _id });
    if (doc) {
        cache.set(_id, doc.value);
        return doc.value;
    }
    return null;
}

export async function getMany<
    A extends keyof SystemKeys, B extends keyof SystemKeys,
    >(keys: [A, B]): Promise<[SystemKeys[A], SystemKeys[B]]>
export async function getMany<
    A extends keyof SystemKeys, B extends keyof SystemKeys, C extends keyof SystemKeys,
    >(keys: [A, B, C]): Promise<[SystemKeys[A], SystemKeys[B], SystemKeys[C]]>
export async function getMany<
    A extends keyof SystemKeys, B extends keyof SystemKeys, C extends keyof SystemKeys,
    D extends keyof SystemKeys,
    >(keys: [A, B, C, D]): Promise<[SystemKeys[A], SystemKeys[B], SystemKeys[C], SystemKeys[D]]>
export async function getMany<
    A extends keyof SystemKeys, B extends keyof SystemKeys, C extends keyof SystemKeys,
    D extends keyof SystemKeys, E extends keyof SystemKeys,
    >(keys: [A, B, C, D, E]): Promise<[SystemKeys[A], SystemKeys[B], SystemKeys[C], SystemKeys[D], SystemKeys[E]]>
export async function getMany<
    A extends keyof SystemKeys, B extends keyof SystemKeys, C extends keyof SystemKeys,
    D extends keyof SystemKeys, E extends keyof SystemKeys, F extends keyof SystemKeys,
    >(keys: [A, B, C, D, E, F]): Promise<[SystemKeys[A], SystemKeys[B], SystemKeys[C], SystemKeys[D], SystemKeys[E], SystemKeys[F]]>
export async function getMany(keys: (keyof SystemKeys)[]): Promise<any[]>
export async function getMany(keys: string[]): Promise<any[]> {
    const r = [];
    let success = true;
    for (const key of keys) {
        const res = cache.get(key);
        if (res !== undefined) r.push(res);
        else success = false;
    }
    if (success) return r;
    const docs = await coll.find({ _id: { $in: keys } }).toArray();
    const dict = {};
    const res = [];
    for (const doc of docs) {
        dict[doc._id] = doc.value;
    }
    for (const key of keys) {
        res.push(dict[key] || null);
    }
    return res;
}

export async function set<K extends keyof SystemKeys>(_id: K, value: SystemKeys[K]) {
    cache.set(_id, value);
    const res = await coll.findOneAndUpdate(
        { _id },
        { $set: { value } },
        { upsert: true, returnOriginal: false },
    );
    return res.value.value;
}

export async function inc<K extends NumberKeys<SystemKeys>>(_id: K) {
    const res = await coll.findOneAndUpdate(
        { _id },
        // FIXME NumberKeys<>
        // @ts-ignore
        { $inc: { value: 1 } },
        { upsert: true, returnOriginal: false },
    );
    cache.set(_id, res.value.value);
    return res.value.value;
}

global.Hydro.model.system = {
    get,
    getMany,
    inc,
    set,
};
