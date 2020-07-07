import { OpcountExceededError } from '../error';
import * as db from '../service/db';

const coll = db.collection('opcount');

export async function inc(op: string, ident: string, periodSecs: number, maxOperations: number) {
    const curTime = new Date().getTime();
    const beginAt = new Date(curTime - (curTime % (periodSecs * 1000)));
    const expireAt = new Date(beginAt.getTime() + periodSecs * 1000);
    try {
        await coll.findOneAndUpdate({
            ident,
            beginAt,
            expireAt,
            op: { $not: { $gte: maxOperations } },
        }, { $inc: { op: 1 } }, { upsert: true });
    } catch (e) {
        throw new OpcountExceededError(op, periodSecs, maxOperations);
    }
}

export function ensureIndexes() {
    return coll.createIndex('expireAt', { expireAfterSeconds: 0 });
}

global.Hydro.model.opcount = { inc, ensureIndexes };
