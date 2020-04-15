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
/**
 * Increments the user counter.
 * @returns {number} Integer value after increment.
 */
function incUserCounter() {
    return update('userCounter', { $inc: { value: 1 } }, { upsert: true });
}
/**
 * Increments the problem ID counter.
 * @returns {number} Integer value before increment.
 */
function incPidCounter() {
    return update('userCounter', { $inc: { value: 1 } }, { upsert: true });
}
async function acquireLock(name) {
    const value = Math.floor(Math.random() * 0xFFFFFFFF);
    try {
        await coll.updateOne({ _id: `lock_${name}`, value: 0 }, { $set: { value } }, { upsert: true });
    } catch (e) { return null; }
    return value;
}
async function releaseLock(name, value) {
    const result = await coll.updateOne({ _id: `lock_${name}`, value }, { $set: { value: 0 } });
    return !!result.matchedCount;
}
async function releaseLockAnyway(name) {
    await coll.updateOne({ _id: `lock_${name}` }, { $set: { value: 0 } });
    return true;
}
module.exports = {
    get,
    update,
    incPidCounter,
    incUserCounter,
    acquireLock,
    releaseLock,
    releaseLockAnyway,
};
