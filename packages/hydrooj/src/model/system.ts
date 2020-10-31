import { SYSTEM_SETTINGS } from './setting';
import { NumberKeys } from '../typeutils';
import { SystemKeys } from '../interface';
import * as db from '../service/db';
import * as bus from '../service/bus';

const coll = db.collection('system');
const cache: Record<string, any> = {};

export function get<K extends keyof SystemKeys>(key: K): SystemKeys[K] {
    return cache[key];
}

export function getMany<
    A extends keyof SystemKeys, B extends keyof SystemKeys,
    >(keys: [A, B]): [SystemKeys[A], SystemKeys[B]]
export function getMany<
    A extends keyof SystemKeys, B extends keyof SystemKeys, C extends keyof SystemKeys,
    >(keys: [A, B, C]): [SystemKeys[A], SystemKeys[B], SystemKeys[C]]
export function getMany<
    A extends keyof SystemKeys, B extends keyof SystemKeys, C extends keyof SystemKeys,
    D extends keyof SystemKeys,
    >(keys: [A, B, C, D]): [SystemKeys[A], SystemKeys[B], SystemKeys[C], SystemKeys[D]]
export function getMany<
    A extends keyof SystemKeys, B extends keyof SystemKeys, C extends keyof SystemKeys,
    D extends keyof SystemKeys, E extends keyof SystemKeys,
    >(keys: [A, B, C, D, E]): [SystemKeys[A], SystemKeys[B], SystemKeys[C], SystemKeys[D], SystemKeys[E]]
export function getMany<
    A extends keyof SystemKeys, B extends keyof SystemKeys, C extends keyof SystemKeys,
    D extends keyof SystemKeys, E extends keyof SystemKeys, F extends keyof SystemKeys,
    >(keys: [A, B, C, D, E, F]): [SystemKeys[A], SystemKeys[B], SystemKeys[C], SystemKeys[D], SystemKeys[E], SystemKeys[F]]
export function getMany(keys: (keyof SystemKeys)[]): any[]
export function getMany(keys: string[]): any[] {
    return keys.map((key) => cache[key]);
}

export async function set<K extends keyof SystemKeys>(_id: K, value: SystemKeys[K]) {
    const res = await coll.findOneAndUpdate(
        { _id },
        { $set: { value } },
        { upsert: true, returnOriginal: false },
    );
    cache[_id] = res.value.value;
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
    cache[_id] = res.value.value;
    return res.value.value;
}

(async () => {
    for (const setting of SYSTEM_SETTINGS) {
        if (setting.value) cache[setting.key] = setting.value;
    }
    const config = await coll.find({}).toArray();
    for (const i of config) cache[i._id] = i.value;
    bus.emit('database/config');
})();

global.Hydro.model.system = {
    get,
    getMany,
    inc,
    set,
};
