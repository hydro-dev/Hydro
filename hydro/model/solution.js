const { ObjectID } = require('bson');
const { SolutionNotFoundError } = require('../error');
const validator = require('../lib/validator');
const db = require('../service/db');

const coll = db.collection('solution');
const collStatus = db.collection('solution.status');

/**
 * @param {string} pid
 * @param {number} owner
 * @param {string} content
 */
async function add(pid, owner, content) {
    validator.checkContent(content);
    pid = new ObjectID(pid);
    const res = await coll.insertOne({
        content, owner, pid, reply: [], vote: 0,
    });
    return res.insertedId;
}

async function get(psid) {
    psid = new ObjectID(psid);
    const psdoc = await coll.findOne({ _id: psid });
    if (!psdoc) throw new SolutionNotFoundError();
    return psdoc;
}

function getMany(query, sort, page, limit) {
    return coll.find(query).sort(sort)
        .skip((page - 1) * limit).limit(limit)
        .toArray();
}

async function edit(_id, content) {
    validator.checkContent(content);
    await coll.updateOne({ _id }, { $set: { content } });
    const psdoc = await get(_id);
    if (!psdoc) throw new SolutionNotFoundError(_id);
    return psdoc;
}

function del(psid) {
    return coll.deleteOne({ _id: psid });
}

function count(query) {
    return coll.find(query).count();
}

function getMulti(pid) {
    return coll.find({ pid }).sort({ vote: -1 });
}

function reply(psid, owner, content) {
    validator.checkContent(content);
    return coll.findOneAndUpdate(
        { _id: psid },
        { $push: { reply: { content, owner, _id: new ObjectID() } } },
    );
}

async function getReply(psid, psrid) {
    const psdoc = await coll.findOne({ _id: psid, reply: { $elemMatch: { _id: psrid } } });
    if (!psdoc) return [null, null];
    for (const psrdoc of psdoc) if (psrdoc._id === psrid) return [psdoc, psrdoc];
    return [psdoc, null];
}

async function editReply(psid, psrid, content) {
    validator.checkContent(content);
    psid = new ObjectID(psid);
    psrid = new ObjectID(psrid);
    const psdoc = await coll.findOne({ _id: psid, reply: { $elemMatch: { _id: psrid } } });
    const { reply } = psdoc; // eslint-disable-line no-shadow
    for (const i in reply) {
        if (reply[i]._id === psrid) {
            reply[i].content = content;
            break;
        }
    }
    // eslint-disable-next-line no-return-await
    return await coll.updateOne({ _id: psdoc._id }, { $set: { reply } });
}

function delReply(psid, psrid) {
    return coll.findOneAndUpdate({ _id: psid }, { $pull: { reply: { _id: psrid } } });
}

async function vote(psid, uid, value) {
    let pssdoc = await collStatus.findOne({ psid, uid });
    if (pssdoc) await collStatus.deleteOne({ psid, uid });
    await collStatus.insertOne({ psid, uid, vote: value });
    if (pssdoc) value += -pssdoc.vote;
    await coll.updateOne({ _id: psid }, { $inc: { vote: value } });
    pssdoc = await collStatus.findOne({ psid, uid });
    const psdoc = await coll.findOne({ _id: psid });
    return [psdoc, pssdoc];
}

async function getListStatus(list, uid) {
    const result = {};
    const res = await collStatus.find({ uid, psid: { $in: list } }).toArray();
    for (const i of res) result[i.psid] = i;
    return result;
}

global.Hydro.model.solution = module.exports = {
    count,
    add,
    get,
    edit,
    del,
    getMany,
    getMulti,
    reply,
    getReply,
    editReply,
    delReply,
    vote,
    getListStatus,
};
