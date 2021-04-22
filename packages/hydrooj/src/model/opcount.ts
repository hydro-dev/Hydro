import { OpcountExceededError } from '../error';
import * as bus from '../service/bus';
import db from '../service/db';

const coll = db.collection('opcount');

export async function inc(op: string, ident: string, periodSecs: number, maxOperations: number) {
    const now = new Date().getTime();
    const expireAt = new Date(now - (now % (periodSecs * 1000)) + periodSecs * 1000);
    try {
        await coll.findOneAndUpdate({
            op,
            ident,
            expireAt,
            opcount: { $lt: maxOperations },
        }, { $inc: { opcount: 1 } }, { upsert: true });
    } catch (e) {
        if (e.message.includes('duplicate')) throw new OpcountExceededError(op, periodSecs, maxOperations);
        throw e;
    }
}

function ensureIndexes() {
    return Promise.all([
        coll.createIndex('expireAt', { expireAfterSeconds: 0 }),
        coll.createIndex({ op: 1, ident: 1, expireAt: 1 }, { unique: true }),
    ]);
}

bus.once('app/started', ensureIndexes);
global.Hydro.model.opcount = { inc };
