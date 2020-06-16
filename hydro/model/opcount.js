const { OpcountExceededError } = require('../error');
const db = require('../service/db');

const coll = db.collection('opcount');

/**
 * @param {string} op
 * @param {string} ident
 * @param {number} period_secs
 * @param {number} max_operations
 */
async function inc(op, ident, periodSecs, maxOperations) {
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

function ensureIndexes() {
    return coll.createIndex('expireAt', { expireAfterSeconds: 0 });
}

global.Hydro.model.opcount = module.exports = { inc, ensureIndexes };
