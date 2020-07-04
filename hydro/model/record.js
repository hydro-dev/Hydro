const _ = require('lodash');
const { ObjectID } = require('mongodb');
const { STATUS_WAITING } = require('./builtin').STATUS;
const task = require('./task');
const problem = require('./problem');
const { RecordNotFoundError } = require('../error');
const db = require('../service/db');

const coll = db.collection('record');

/**
 * @param {string} domainId
 * @param {import('../interface').Record} data
 */
async function add(domainId, data, addTask = true) {
    _.defaults(data, {
        status: STATUS_WAITING,
        domainId,
        score: 0,
        time: 0,
        memory: 0,
        hidden: false,
        judgeTexts: [],
        compilerTexts: [],
        testCases: [],
        judger: null,
        judgeAt: null,
    });
    const [pdoc, res] = await Promise.all([
        problem.get(domainId, data.pid, null, false),
        coll.insertOne(data),
    ]);
    if (addTask) {
        const t = {
            type: data.type || 'judge',
            event: data.type || 'judge',
            rid: res.insertedId,
            domainId,
            pid: data.pid,
            lang: data.lang,
            code: data.code,
        };
        if (t.type === 'judge') {
            t.data = pdoc.data;
            t.config = pdoc.config;
        } else {
            t.config = {
                time: data.time,
                memory: data.memory,
                input: data.input,
            };
        }
        await task.add(t);
    }
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

function getMulti(domainId, query) {
    return coll.find({ ...query, domainId });
}

async function update(domainId, rid, $set, $push, $unset) {
    const _id = new ObjectID(rid);
    const $update = {};
    if ($set && Object.keys($set).length) $update.$set = $set;
    if ($push && Object.keys($push).length) $update.$push = $push;
    if ($unset && Object.keys($unset).length) $update.$unset = $unset;
    const res = await coll.findOneAndUpdate({ domainId, _id }, $update, { returnOriginal: false });
    if (!res.value) throw new RecordNotFoundError(rid);
    return res.value;
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

function getUserInProblemMulti(domainId, uid, pid) {
    return coll.find({ domainId, uid, pid });
}

function getByUid(domainId, uid) {
    return coll.find({ domainId, uid }).toArray();
}

async function judge(domainId, rid) {
    const rdoc = await get(domainId, rid);
    const pdoc = await problem.get(domainId, rdoc.pid);
    await task.add({
        type: 'judge',
        rid,
        domainId,
        config: pdoc.config || '',
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
    getMulti,
    update,
    count,
    reset,
    getList,
    getUserInProblemMulti,
    getByUid,
    judge,
    rejudge,
};
