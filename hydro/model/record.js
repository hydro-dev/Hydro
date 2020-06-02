const _ = require('lodash');
const { ObjectID } = require('bson');
const { STATUS_WAITING } = require('./builtin').STATUS;
const task = require('./task');
const problem = require('./problem');
const { RecordNotFoundError, PermissionError } = require('../error');
const db = require('../service/db');

const coll = db.collection('record');

/**
 * @param {string} domainId
 * @param {import('../interface').Record} data
 */
async function add(domainId, data) {
    _.defaults(data, {
        status: STATUS_WAITING,
        domainId,
        score: 0,
        time: 0,
        memory: 0,
        rejudged: false,
        judgeTexts: [],
        compilerTexts: [],
        testCases: [],
        judger: null,
        judgeAt: null,
    });
    const [pdoc, res] = await Promise.all([
        problem.get(domainId, data.pid),
        coll.insertOne(data),
    ]);
    await task.add({
        type: 'judge',
        rid: res.insertedId,
        domainId,
        pid: data.pid,
        data: pdoc.data,
        lang: data.lang,
        code: data.code,
    });
    return res.insertedId;
}

/**
 * @param {string} domainId
 * @param {ObjectID} rid
 * @returns {import('../interface').Record}
 */
async function get(domainId, rid) {
    const _id = new ObjectID(rid);
    const rdoc = await coll.findOne({ domainId, _id });
    if (!rdoc) throw new RecordNotFoundError(rid);
    return rdoc;
}

function getMany(domainId, query, sort, page, limit) {
    return coll.find({ ...query, domainId }).sort(sort).skip((page - 1) * limit).limit(limit)
        .toArray();
}

async function update(domainId, rid, $set, $push) {
    const _id = new ObjectID(rid);
    const upd = {};
    if ($set && Object.keys($set).length) upd.$set = $set;
    if ($push && Object.keys($push).length) upd.$push = $push;
    await coll.findOneAndUpdate({ domainId, _id }, upd);
    const rdoc = await coll.findOne({ _id });
    if (!rdoc) throw new RecordNotFoundError(rid);
    return rdoc;
}

function reset(domainId, rid) {
    return update(domainId, rid, {
        score: 0,
        status: STATUS_WAITING,
        time: 0,
        memory: 0,
        testCases: [],
        judgeTexts: [],
        compilerTexts: [],
        judgeAt: null,
        judger: null,
        rejudged: true,
    });
}

function count(domainId, query) {
    return coll.find({ domainId, ...query }).count();
}

async function getList(domainId, rids, showHidden = false) {
    const r = {};
    // eslint-disable-next-line no-await-in-loop
    for (const rid of rids) r[rid] = await get(domainId, rid, showHidden);
    return r;
}

function getUserInProblemMulti(domainId, uid, pid, getHidden = false) {
    if (getHidden) return coll.find({ domainId, owner: uid, pid });
    return coll.find({
        domainId, owner: uid, pid, hidden: false,
    });
}

async function judge(domainId, rid) {
    const rdoc = await get(domainId, rid);
    const pdoc = await problem.get(domainId, rdoc.pid);
    await task.add({
        type: 'judge',
        rid,
        domainId,
        pid: rdoc.pid,
        data: pdoc.data,
        lang: rdoc.lang,
        code: rdoc.code,
    });
}

async function rejudge(domainId, rid) {
    await reset(domainId, rid);
    const rdoc = await get(domainId, rid);
    const pdoc = await problem.get(domainId, rdoc.pid);
    await task.add({
        type: 'judge',
        rid,
        domainId,
        pid: rdoc.pid,
        data: pdoc.data,
        lang: rdoc.lang,
        code: rdoc.code,
    });
}

global.Hydro.model.record = module.exports = {
    add,
    get,
    getMany,
    update,
    count,
    reset,
    getList,
    getUserInProblemMulti,
    judge,
    rejudge,
};
