const db = require('../service/db');

const coll = db.collection('blacklist');

async function add(ip) {
    const expireAt = new Date(new Date().getTime() + 365 * 24 * 60 * 60 * 1000);
    return coll.findOneAndUpdate({ _id: ip }, { $set: { expireAt } }, { upsert: true });
}

function get(ip) {
    return coll.findOne({ _id: ip });
}

function del(ip) {
    return coll.deleteOne({ _id: ip });
}

function ensureIndexes() {
    return coll.createIndex('expireAt', { expireAfterSeconds: 0 });
}

global.Hydro.model.blacklist = module.exports = {
    add, get, del, ensureIndexes,
};
