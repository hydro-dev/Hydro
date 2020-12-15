import db from '../service/db';
import * as bus from '../service/bus';

const coll = db.collection('blacklist');

export async function add(ip: string) {
    /**
     * Add a ip into blacklist.
     * @param {string} ip
     * @returns {Promise<Bdoc>}
     */
    const expireAt = new Date(new Date().getTime() + 365 * 24 * 60 * 60 * 1000);
    const res = await coll.findOneAndUpdate(
        { _id: ip },
        { $set: { expireAt } },
        { upsert: true, returnOriginal: false },
    );
    return res.value;
}

export function get(ip: string) {
    /**
     * Get a ip, return null if not.
     * @param {string} ip
     * @returns {Promise<Bdoc>}
     */
    return coll.findOne({ _id: ip });
}

export function del(ip: string) {
    return coll.deleteOne({ _id: ip });
}

function ensureIndexes() {
    return coll.createIndex('expireAt', { expireAfterSeconds: 0 });
}

bus.once('app/started', ensureIndexes);
global.Hydro.model.blacklist = { add, get, del };
