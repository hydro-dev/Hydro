const { MessageNotFoundError } = require('../error');
const db = require('../service/db.js');

const coll = db.collection('message');

async function add(from, to, content) {
    const res = await coll.insertOne({
        from,
        to,
        fromUnread: false,
        toUnread: true,
        reply: [
            {
                from, unread: true, content, at: new Date(),
            },
        ],
    });
    return await coll.findOne({ _id: res.insertedId }); // eslint-disable-line no-return-await
}

async function get(_id) {
    const doc = await coll.findOne({ _id });
    if (!doc) throw new MessageNotFoundError();
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

async function addReply(_id, from, content) {
    const reply = {
        from,
        content,
        unread: true,
        at: new Date(),
    };
    await coll.updateOne({ _id }, { $push: { reply } });
    return await coll.findOne({ _id }); // eslint-disable-line no-return-await
}

async function send(from, to, content) {
    const sdoc = await coll.findOne({ $or: [{ from, to }, { from: to, to: from }] });
    await addReply(sdoc._id, from, content);
    return sdoc._id;
}

function index() {
    return Promise.all([
        coll.createIndex({ to: 1, _id: -1 }),
        coll.createIndex({ from: 1, _id: -1 }),
    ]);
}

global.Hydro.model.message = module.exports = {
    count,
    add,
    get,
    del,
    getMany,
    getMulti,
    addReply,
    send,
    index,
};
