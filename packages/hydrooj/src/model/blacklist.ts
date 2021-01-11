import db from '../service/db';
import * as bus from '../service/bus';

const coll = db.collection('blacklist');

export async function add(ip: string) {
    const expireAt = new Date(new Date().getTime() + 365 * 24 * 60 * 60 * 1000);
    const res = await coll.findOneAndUpdate(
        { _id: ip },
        { $set: { expireAt } },
        { upsert: true, returnOriginal: false },
    );
    return res.value;
}

export async function get(ip: string) {
    return await coll.findOne({ _id: ip });
}

export async function del(ip: string) {
    return await coll.deleteOne({ _id: ip });
}

async function ensureIndexes() {
    return await coll.createIndex('expireAt', { expireAfterSeconds: 0 });
}

bus.once('app/started', ensureIndexes);
global.Hydro.model.blacklist = { add, get, del };
