const { MessageNotFoundError } = require('../error');
const db = require('../service/db.js');

const coll = db.collection('message');

async function send(from, to, content) {
    const res = await coll.insertOne({
        from, to, content, unread: true,
    });
    return {
        from, to, content, unread: true, _id: res.insertedId,
    };
}

async function get(_id) {
    const doc = await coll.findOne({ _id });
    if (!doc) throw new MessageNotFoundError(_id);
    return doc;
}

function getByUser(uid) {
    return coll.find({ $or: [{ from: uid }, { to: uid }] }).sort('_id', 1).toArray();
}

function getMany(query, sort, page, limit) {
    return coll.find(query).sort(sort)
        .skip((page - 1) * limit).limit(limit)
        .toArray();
}

function del(_id) {
    return coll.deleteOne({ _id });
}

function count(query) {
    return coll.find(query).count();
}

function getMulti(uid) {
    return coll.find({ $or: [{ from: uid }, { to: uid }] });
}

function ensureIndexes() {
    return Promise.all([
        coll.createIndex({ to: 1, _id: -1 }),
        coll.createIndex({ from: 1, _id: -1 }),
    ]);
}

global.Hydro.model.message = module.exports = {
    count,
    get,
    getByUser,
    del,
    getMany,
    getMulti,
    send,
    ensureIndexes,
};
