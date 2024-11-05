import { SystemKeys } from '../interface';
import * as bus from '../service/bus';
import db from '../service/db';
import { NumberKeys } from '../typeutils';
import { SYSTEM_SETTINGS } from './setting';

const coll = db.collection('system');
const cache: Record<string, any> = Object.create(null);

export function get<K extends keyof SystemKeys>(key: K): SystemKeys[K];
export function get(key: string): any;
export function get(key: string): any {
    return cache[key];
}

export function getMany<
    A extends keyof SystemKeys, B extends keyof SystemKeys,
>(keys: [A, B]): [SystemKeys[A], SystemKeys[B]];
export function getMany<
    A extends keyof SystemKeys, B extends keyof SystemKeys, C extends keyof SystemKeys,
>(keys: [A, B, C]): [SystemKeys[A], SystemKeys[B], SystemKeys[C]];
export function getMany<
    A extends keyof SystemKeys, B extends keyof SystemKeys, C extends keyof SystemKeys,
    D extends keyof SystemKeys,
>(keys: [A, B, C, D]): [SystemKeys[A], SystemKeys[B], SystemKeys[C], SystemKeys[D]];
export function getMany<
    A extends keyof SystemKeys, B extends keyof SystemKeys, C extends keyof SystemKeys,
    D extends keyof SystemKeys, E extends keyof SystemKeys,
>(keys: [A, B, C, D, E]): [SystemKeys[A], SystemKeys[B], SystemKeys[C], SystemKeys[D], SystemKeys[E]];
export function getMany<
    A extends keyof SystemKeys, B extends keyof SystemKeys, C extends keyof SystemKeys,
    D extends keyof SystemKeys, E extends keyof SystemKeys, F extends keyof SystemKeys,
>(keys: [A, B, C, D, E, F]): [SystemKeys[A], SystemKeys[B], SystemKeys[C], SystemKeys[D], SystemKeys[E], SystemKeys[F]];
export function getMany(keys: (keyof SystemKeys)[]): any[];
export function getMany(keys: string[]): any[] {
    return keys.map((key) => cache[key]);
}

export async function set<K extends keyof SystemKeys>(_id: K, value: SystemKeys[K], broadcast?: boolean): Promise<SystemKeys[K]>;
export async function set<K>(_id: string, value: K, broadcast?: boolean): Promise<K>;
export async function set(_id: string, value: any, broadcast = true) {
    if (broadcast) bus.broadcast('system/setting', { [_id]: value });
    const res = await coll.findOneAndUpdate(
        { _id },
        { $set: { value } },
        { upsert: true, returnDocument: 'after' },
    );
    cache[_id] = res.value.value;
    return res.value.value;
}

export async function inc<K extends NumberKeys<SystemKeys>>(_id: K) {
    const res = await coll.findOneAndUpdate(
        { _id },
        { $inc: { value: 1 } as any },
        { upsert: true, returnDocument: 'after' },
    );
    cache[_id] = res.value.value;
    return res.value.value;
}

export async function runConfig() {
    for (const setting of SYSTEM_SETTINGS) {
        if (setting.value) cache[setting.key] = setting.value;
    }
    const config = await coll.find().toArray();
    for (const i of config) cache[i._id] = i.value;
    await bus.emit('database/config');
}

bus.on('system/setting', (args) => {
    for (const key in args) cache[key] = args[key];
});

global.Hydro.model.system = {
    runConfig,
    get,
    getMany,
    inc,
    set,
};
