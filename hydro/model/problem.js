const
    { ObjectID } = require('bson'),
    { ProblemNotFoundError } = require('../error'),
    validator = require('../lib/validator'),
    db = require('../service/db.js'),
    coll = db.collection('problem'),
    coll_status = db.collection('problem.status');

/**
 * @param {string} title 
 * @param {string} content 
 * @param {number} owner 
 * @param {number} pid 
 * @param {import('bson').ObjectID} data 
 * @param {string[]} category 
 * @param {string[]} tag 
 * @param {boolean} hidden 
 */
async function add({
    title,
    content,
    owner,
    pid = null,
    data = null,
    category = [],
    tag = [],
    hidden = false
}) {
    validator.checkTitle(title);
    validator.checkContent(content);
    await coll.insertOne({
        content,
        owner,
        pid,
        title,
        data,
        category,
        tag,
        hidden,
        nSubmit: 0,
        nAccept: 0
    });
    return pid;
}
async function get({ pid, uid }) {
    let query = {};
    if (pid.generationTime || pid.length == 24) query = { _id: new ObjectID(pid) };
    else query = { pid: parseInt(pid) || pid };
    let pdoc = await coll.findOne(query);
    if (!pdoc) throw new ProblemNotFoundError(pid);
    if (uid) {
        query.uid = uid;
        pdoc.psdoc = await coll_status.findOne(query);
    }
    return pdoc;
}
async function getById(_id) {
    _id = new ObjectID(_id);
    let pdoc = await coll.findOne({ _id });
    if (!pdoc) throw new ProblemNotFoundError(_id);
    return pdoc;
}
async function getMany(query, sort, page, limit) {
    return await coll.find(query).sort(sort).skip((page - 1) * limit).limit(limit).toArray();
}
function getMulti(query) {
    return coll.find(query);
}
async function edit(_id, $set) {
    if ($set.title) validator.checkTitle($set.title);
    if ($set.content) validator.checkContent($set.content);
    await coll.findOneAndUpdate({ _id }, { $set });
    let pdoc = await getById(_id);
    if (!pdoc) throw new ProblemNotFoundError(_id);
    return pdoc;
}
async function count(query) {
    return await coll.find(query).count();
}
async function random(query) {
    let pdocs = coll.find(query);
    let pcount = await pdocs.count();
    if (pcount) {
        let pdoc = await pdocs.skip(Math.floor(Math.random() * pcount)).limit(1).toArray()[0];
        return pdoc.pid;
    } else return null;
}
async function getList(pids) {
    let r = {};
    for (let pid of pids) r[pid] = await get({pid});
    return r;
}

module.exports = {
    add,
    get,
    getMany,
    edit,
    count,
    random,
    getById,
    getMulti,
    getList
};