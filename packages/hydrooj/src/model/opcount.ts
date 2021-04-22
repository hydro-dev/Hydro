import { OpcountExceededError } from '../error';
import * as bus from '../service/bus';
import db from '../service/db';

const coll = db.collection('opcount');

export async function inc(op: string, ident: string, periodSecs: number, maxOperations: number) {
    const curTime = new Date().getTime();
    const beginAt = new Date(curTime - (curTime % (periodSecs * 1000)));
    const expireAt = new Date(beginAt.getTime() + periodSecs * 1000);
    try {
        await coll.findOneAndUpdate({
            op,
            ident,
            beginAt,
            expireAt,
            opcount: { $lt: maxOperations },
        }, { $inc: { opcount: 1 } }, { upsert: true });
    } catch (e) {
        throw new OpcountExceededError(op, periodSecs, maxOperations);
    }
}

function ensureIndexes() {
    return Promise.all([
        coll.createIndex('expireAt', { expireAfterSeconds: 0 }),
        coll.createIndex({ op: 1, ident: 1 }, { unique: true }),
    ]);
}

bus.once('app/started', ensureIndexes);
global.Hydro.model.opcount = { inc };
