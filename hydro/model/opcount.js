const
    { OpcountExceededError } = require('../error'),
    db = require('../service/db.js'),
    coll = db.collection('opcount');

module.exports = {
    /**
     * @param {string} op 
     * @param {string} ident 
     * @param {number} period_secs 
     * @param {number} max_operations 
     */
    async inc(op, ident, period_secs, max_operations) {
        let cur_time = new Date().getTime();
        let begin_at = new Date(cur_time - cur_time % (period_secs * 1000));
        let expire_at = new Date(begin_at.getTime() + period_secs * 1000);
        try {
            await coll.findOneAndUpdate({
                ident, begin_at, expire_at,
                op: { $not: { $gte: max_operations } }
            }, { $inc: { op: 1 } }, { upsert: true });
        } catch (e) {
            throw new OpcountExceededError(op, period_secs, max_operations);
        }
    }
};
/*
@argmethod.wrap
async def ensure_indexes():
  coll = db.coll('opcount')
  await coll.create_index([('ident', 1),
                           ('begin_at', 1),
                           ('expire_at', 1)], unique=True)
  await coll.create_index('expire_at', expireAfterSeconds=0)
*/