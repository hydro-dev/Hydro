const { ObjectID } = require('bson');
const { DocumentNotFoundError } = require('../error');
const db = require('../service/db.js');

const coll = db.collection('discussion');
const collReply = db.collection('discussion.reply');
const collStatus = db.collection('discussion.status');

function add(parentType, parentId, owner, title, content, ip = null, highlight = false) {
    return coll.insertOne({
        owner,
        title,
        content,
        ip,
        highlight,
        parentType,
        parentId,
        nReply: 0,
        updateAt: new Date(),
    });
}

function get(did) {
    return coll.findOne({ _id: did });
}

function edit(did, title, content, highlight) {
    return coll.findOneAndUpdate({ _id: did }, { $set: { title, content, highlight } });
}

function del(did) {
    return Promise.all([
        coll.deleteOne({ _id: did }),
        collReply.deleteMany({ did }),
        collStatus.deleteMany({ did }),
    ]);
}

function count(query) {
    return coll.find(query).count();
}

function getMulti(query) {
    return coll.find(query).sort('updateAt', -1);
}

async function addReply(did, owner, content, ip) {
    const [drdoc] = await Promise.all([
        collReply.insertOne({
            owner, did, content, ip,
        }),
        coll.updateOne({ _id: did }, { $inc: { nReply: 1 }, $set: { updateAt: new Date() } }),
    ]);
    return drdoc;
}

function getReply(drid) {
    return collReply.findOne({ _id: drid });
}

function editReply(drid, content) {
    return collReply.updateOne({ _id: drid }, { $set: { content } });
}

async function delReply(drid) {
    const drdoc = await getReply(drid);
    if (!drdoc) throw new DocumentNotFoundError(drid);
    return await Promise.all([
        collReply.deleteOne({ _id: drid }),
        coll.updateOne({ _id: drdoc.did }, { $inc: { nReply: -1 } }),
    ]);
}

function getMultiReply(did) {
    return coll.find({ did }).sort('_id', -1);
}

function getListReply(did) {
    return getMultiReply({ did }).toArray();
}

async function addTailReply(drid, owner, content, ip) {
    let drdoc = await collReply.findOne({ _id: drid });
    const sid = new ObjectID();
    await Promise.all([
        collReply.updateOne({ _id: drid }, {
            $push: {
                reply: {
                    _id: sid, content, owner, ip,
                },
            },
        }),
        coll.updateOne({ _id: drdoc.did }, { $set: { updateAt: new Date() } }),
    ]);
    drdoc = await collReply.findOne({ _id: drid });
    return [drdoc, sid];
}

async function getTailReply(drid, drrid) {
    const drdoc = await collReply.findOne({ _id: drid, reply: { $elemMatch: { _id: drrid } } });
    if (!drdoc) return [null, null];
    for (const drrdoc of drdoc) if (drrdoc._id === drrid) return [drdoc, drrdoc];
    return [drdoc, null];
}

async function editTailReply(drid, drrid, content) {
    const drdoc = await collReply.findOne({ _id: drid, reply: { $elemMatch: { _id: drrid } } });
    const { reply } = drdoc;
    for (const i in reply) {
        if (reply[i]._id === drrid) {
            reply[i].content = content;
            break;
        }
    }
    return await collReply.findOneAndUpdate({ _id: drdoc._id }, { $set: { reply } });
}

function delTailReply(drid, drrid) {
    return coll.findOneAndUpdate({ _id: drid }, { $pull: { reply: { _id: drrid } } });
}

function setStar(did, uid, star) {
    return collStatus.findOneAndUpdate({ did, uid }, { $set: { star } }, { upsert: true });
}

function getStatus(did, uid) {
    return collStatus.findOne({ did, uid });
}

module.exports = {
    add,
    get,
    edit,
    del,
    count,
    getMulti,
    addReply,
    getReply,
    editReply,
    delReply,
    getMultiReply,
    getListReply,
    addTailReply,
    getTailReply,
    editTailReply,
    delTailReply,
    setStar,
    getStatus,
};
