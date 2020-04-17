const _ = require('lodash');
const { ObjectID } = require('bson');
const { RecordNotFoundError } = require('../error');
const { STATUS_WAITING } = require('./builtin').STATUS;
const db = require('../service/db.js');

const coll = db.collection('record');

/**
 * @param {import('../interface').Record} data
 */
async function add(data) {
    _.defaults(data, {
        status: STATUS_WAITING,
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
    const res = await coll.insertOne(data);
    return res.insertedId;
}
/**
 * @param {string} rid
 * @returns {import('../interface').Record}
 */
async function get(rid) {
    const _id = new ObjectID(rid);
    const rdoc = await coll.findOne({ _id });
    if (!rdoc) throw new RecordNotFoundError(rid);
    return rdoc;
}
function getMany(query, sort, page, limit) {
    return coll.find(query).sort(sort).skip((page - 1) * limit).limit(limit)
        .toArray();
}
async function update(rid, $set, $push) {
    const _id = new ObjectID(rid);
    const upd = {};
    if ($set && Object.keys($set).length) upd.$set = $set;
    if ($push && Object.keys($push).length) upd.$push = $push;
    await coll.findOneAndUpdate({ _id }, upd);
    const rdoc = await coll.findOne({ _id });
    if (!rdoc) throw new RecordNotFoundError(rid);
    return rdoc;
}
function reset(rid) {
    return update(rid, {
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
function count(query) {
    return coll.find(query).count();
}
async function getList(rids) {
    const r = {};
    for (const rid of rids) r[rid] = await get(rid); // eslint-disable-line no-await-in-loop
    return r;
}
function getUserInProblemMulti(uid, pid) {
    return coll.find({ owner: uid, pid });
}

module.exports = {
    add,
    get,
    getMany,
    update,
    count,
    reset,
    getList,
    getUserInProblemMulti,
};
