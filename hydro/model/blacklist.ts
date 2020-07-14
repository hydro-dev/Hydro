import * as db from '../service/db';
import { Bdoc } from '../interface';

const coll = db.collection('blacklist');

export async function add(ip: string): Promise<Bdoc> {
    const expireAt = new Date(new Date().getTime() + 365 * 24 * 60 * 60 * 1000);
    const res = await coll.findOneAndUpdate(
        { _id: ip },
        { $set: { expireAt } },
        { upsert: true, returnOriginal: false },
    );
    return res.value;
}

export function get(ip: string): Promise<Bdoc> {
    return coll.findOne({ _id: ip });
}

export function del(ip: string) {
    return coll.deleteOne({ _id: ip });
}

export function ensureIndexes() {
    return coll.createIndex('expireAt', { expireAfterSeconds: 0 });
}

global.Hydro.model.blacklist = {
    add, get, del, ensureIndexes,
};
