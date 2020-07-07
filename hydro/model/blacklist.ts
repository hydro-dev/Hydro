import * as db from '../service/db';

const coll = db.collection('blacklist');

export async function add(ip: string) {
    const expireAt = new Date(new Date().getTime() + 365 * 24 * 60 * 60 * 1000);
    return coll.findOneAndUpdate({ _id: ip }, { $set: { expireAt } }, { upsert: true });
}

export function get(ip: string) {
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
