import { OpcountExceededError } from '../error';
import db from '../service/db';

const coll = db.collection('opcount');

export async function inc(op: string, ident: string, periodSecs: number, maxOperations: number) {
    const now = new Date().getTime();
    const expireAt = new Date(now - (now % (periodSecs * 1000)) + periodSecs * 1000);
    try {
        const res = await coll.findOneAndUpdate({
            op,
            ident,
            expireAt,
            opcount: { $lt: maxOperations },
        }, { $inc: { opcount: 1 } }, { upsert: true, returnDocument: 'after' });
        return res.value.opcount;
    } catch (e) {
        if (e.message.includes('duplicate')) throw new OpcountExceededError(op, periodSecs, maxOperations);
        throw e;
    }
}

export const apply = () => db.ensureIndexes(
    coll,
    { key: { expireAt: -1 }, name: 'expire', expireAfterSeconds: 0 },
    { key: { op: 1, ident: 1, expireAt: 1 }, name: 'unique', unique: true },
);
global.Hydro.model.opcount = { inc, apply };
