const document = require('./document');
const { SolutionNotFoundError } = require('../error');

/**
 * @param {string} pid
 * @param {number} owner
 * @param {string} content
 */
function add(domainId, pid, owner, content) {
    return document.add(
        domainId, content, owner, document.TYPE_PROBLEM_SOLUTION,
        null, document.TYPE_PROBLEM, pid, { reply: [], vote: 0 },
    );
}

async function get(domainId, psid) {
    const psdoc = await document.get(domainId, document.TYPE_PROBLEM_SOLUTION, psid);
    if (!psdoc) throw new SolutionNotFoundError();
    return psdoc;
}

function getMany(domainId, query, sort, page, limit) {
    return document.getMulti(domainId, document.TYPE_PROBLEM_SOLUTION, query)
        .sort(sort)
        .skip((page - 1) * limit).limit(limit)
        .toArray();
}

function edit(domainId, psid, content) {
    return document.set(domainId, document.TYPE_PROBLEM_SOLUTION, psid, { content });
}

function del(domainId, psid) {
    return document.deleteOne(domainId, document.TYPE_PROBLEM_SOLUTION, psid);
}

function count(domainId, query) {
    return document.count(domainId, document.TYPE_PROBLEM_SOLUTION, query);
}

function getMulti(domainId, pid) {
    return document.getMulti(
        domainId, document.TYPE_PROBLEM_SOLUTION,
        { parentType: document.TYPE_PROBLEM, parentId: pid },
    ).sort({ vote: -1 });
}

function reply(domainId, psid, owner, content) {
    return document.push(domainId, document.TYPE_PROBLEM_SOLUTION, psid, 'reply', content, owner);
}

function getReply(domainId, psid, psrid) {
    return document.getSub(domainId, document.TYPE_PROBLEM_SOLUTION, psid, 'reply', psrid);
}

function editReply(domainId, psid, psrid, content) {
    return document.setSub(domainId, document.TYPE_PROBLEM_SOLUTION, psid, 'reply', psrid, { content });
}

function delReply(domainId, psid, psrid) {
    return document.deleteSub(domainId, document.TYPE_PROBLEM_SOLUTION, psid, 'reply', psrid);
}

async function vote(domainId, psid, uid, value) {
    let pssdoc = await document.getStatus(domainId, document.TYPE_PROBLEM_SOLUTION, psid, uid);
    await document.setStatus(domainId, document.TYPE_PROBLEM_SOLUTION, psid, uid, { vote: value });
    if (pssdoc) value += -pssdoc.vote;
    const psdoc = await document.inc(domainId, document.TYPE_PROBLEM_SOLUTION, psid, 'vote', value);
    pssdoc = await document.getStatus(domainId, document.TYPE_PROBLEM_SOLUTION, psid, uid);
    return [psdoc, pssdoc];
}

async function getListStatus(domainId, list, uid) {
    const result = {};
    const res = await document.getMultiStatus(
        domainId, document.TYPE_PROBLEM_SOLUTION, { uid, psid: { $in: list } },
    ).toArray();
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
