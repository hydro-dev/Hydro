const
    validator = require('../lib/validator'),
    { ProblemNotFoundError } = require('../error'),
    db = require('../service/db.js'),
    coll = db.collection('problem'),
    coll_status = db.collection('problem.status');

/**
 * @param {string} domainId 
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
    domainId,
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
        domainId,
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
async function get({ domainId, pid, uid }) {
    pid = parseInt(pid) || pid;
    let pdoc = await coll.findOne({ domainId, pid });
    if (!pdoc) throw new ProblemNotFoundError(domainId, pid);
    pdoc.psdoc = uid ?
        await coll_status.findOne({ domainId, pid, uid }) :
        null;
    return pdoc;
}
async function getMany(query, sort, page, limit) {
    return await coll.find(query).sort(sort).skip((page - 1) * limit).limit(limit).toArray();
}
async function edit(domainId, pid, $set) {
    if ($set.title) validator.checkTitle($set.title);
    if ($set.content) validator.checkContent($set.content);
    await coll.findOneAndUpdate({ domainId, pid }, { $set });
    let pdoc = await coll.findOne({ domainId, pid });
    if (!pdoc) throw new ProblemNotFoundError(domainId, pid);
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

module.exports = {
    add,
    get,
    getMany,
    edit,
    count,
    random
};