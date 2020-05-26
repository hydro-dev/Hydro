const { ObjectID } = require('bson');
const { MessageNotFoundError } = require('../error');
const db = require('../service/db.js');

const coll = db.collection('message');

async function send(from, to, content) {
    await coll.updateOne({
        from: Math.min(from, to),
        to: Math.max(from, to),
    }, {
        $push: {
            reply: {
                _id: new ObjectID(),
                from,
                content,
                unread: true,
                at: new Date(),
            },
        },
        $setOnInsert: {
            from: Math.min(from, to),
            to: Math.max(from, to),
            fromUnread: from > to,
            toUnread: from < to,
        },
    }, { upsert: true });
    return await coll.findOne({ // eslint-disable-line no-return-await
        from: Math.min(from, to),
        to: Math.max(from, to),
    });
}

async function get(_id) {
    const doc = await coll.findOne({ _id });
    if (!doc) throw new MessageNotFoundError(_id);
    return doc;
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

function index() {
    return Promise.all([
        coll.createIndex({ to: 1, _id: -1 }),
        coll.createIndex({ from: 1, _id: -1 }),
    ]);
}

global.Hydro.model.message = module.exports = {
    count,
    get,
    del,
    getMany,
    getMulti,
    send,
    index,
};
