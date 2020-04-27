const db = require('../service/db.js');

const coll = db.collection('system');

async function get(_id) {
    const doc = await coll.findOne({ _id });
    if (doc) return doc.value;
    return null;
}
async function update(_id, operation, config) {
    await coll.findOneAndUpdate({ _id }, operation, config);
    return get(_id);
}
async function set(_id, value) {
    await coll.findOneAndUpdate({ _id }, { value }, { upsert: true });
    return get(_id);
}
/**
 * Increments the counter.
 * @returns {number} Integer value after increment.
 */
function inc(field) {
    return update(field, { $inc: { value: 1 } }, { upsert: true });
}
module.exports = {
    get,
    update,
    inc,
    set,
};
