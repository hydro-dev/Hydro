const
    { ObjectID } = require('bson'),
    { SolutionNotFoundError, AlreadyVotedError } = require('../error'),
    validator = require('../lib/validator'),
    db = require('../service/db.js'),
    coll = db.collection('solution'),
    coll_status = db.collection('solution.status');

/** 
 * @param {string} pid
 * @param {number} owner 
 * @param {string} content 
 */
async function add(pid, owner, content) {
    validator.checkContent(content);
    pid = new ObjectID(pid);
    let res = await coll.insertOne({ content, owner, pid, reply: [], vote: 0 });
    return res.insertedId;
}
async function get(psid) {
    psid = new ObjectID(psid);
    let psdoc = await coll.findOne({ _id: psid });
    if (!psdoc) throw new SolutionNotFoundError();
    return psdoc;
}
async function getMany(query, sort, page, limit) {
    return await coll.find(query).sort(sort).skip((page - 1) * limit).limit(limit).toArray();
}
async function edit(_id, content) {
    validator.checkContent(content);
    await coll.findOneAndUpdate({ _id }, { $set: { content } });
    let psdoc = await get(_id);
    if (!psdoc) throw new SolutionNotFoundError(_id);
    return psdoc;
}
async function del(psid) {
    psid = new ObjectID(psid);
    return await coll.deleteOne({ _id: psid });
}
async function count(query) {
    return await coll.find(query).count();
}
function getMulti(pid) {
    return coll.find({ pid }).sort({ vote: -1 });
}
async function reply(psid, owner, content) {
    psid = new ObjectID(psid);
    validator.checkContent(content);
    return await coll.findOneAndUpdate({ _id: psid }, { $push: { reply: { content, owner, _id: new ObjectID() } } });
}
async function getReply(psid, psrid) {
    psid = new ObjectID(psid);
    psrid = new ObjectID(psrid);
    let psdoc = await coll.findOne({ _id: psid, reply: { $elemMatch: { _id: psrid } } });
    if (!psdoc) return [null, null];
    for (let psrdoc of psdoc)
        if (psrdoc._id == psrid)
            return [psdoc, psrdoc];
    return [psdoc, null];
}
async function editReply(psid, psrid, content) {
    validator.checkContent(content);
    psid = new ObjectID(psid);
    psrid = new ObjectID(psrid);
    let psdoc = await coll.findOne({ _id: psid, reply: { $elemMatch: { _id: psrid } } });
    let reply = psdoc.reply;
    for (let i in reply)
        if (reply[i]._id == psrid) {
            reply[i].content = content;
            break;
        }
    return await coll.findOneAndUpdate({ _id: psdoc._id }, { $set: { reply } });
}
async function delReply(psid, psrid) {
    return await coll.findOneAndUpdate({ _id: psid }, { $pull: { reply: { _id: psrid } } });
}
async function vote(psid, uid, value) {
    let pssdoc = await coll_status.findOne({ psid, uid });
    if (pssdoc) await coll_status.deleteOne({ psid, uid });
    await coll_status.insertOne({ psid, uid, vote: value });
    if (pssdoc) value += -pssdoc.vote;
    await coll.findOneAndUpdate({ _id: psid }, { $inc: { vote: value } });
    pssdoc = await coll_status.findOne({ psid, uid });
    let psdoc = await coll.findOne({ _id: psid });
    return [psdoc, pssdoc];
}
async function getListStatus(list, uid) {
    let result = {};
    let res = await coll_status.find({ uid, psid: { $in: list } }).toArray();
    for (let i of res) result[i.psid] = i;
    return result;
}
module.exports = {
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
    getListStatus
};