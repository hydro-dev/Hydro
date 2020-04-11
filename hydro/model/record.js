const
    _ = require('lodash'),
    { ObjectID } = require('bson'),
    { RecordNotFoundError } = require('../error'),
    { STATUS_WAITING } = require('../model/builtin').STATUS,
    db = require('../service/db.js'),
    coll = db.collection('record');

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
        judgeAt: null
    });
    let res = await coll.insertOne(data);
    return res.insertedId;
}
/**
 * @param {string} rid 
 * @returns {import('../interface').Record}
 */
async function get(rid) {
    let _id = new ObjectID(rid);
    let rdoc = await coll.findOne({ _id });
    if (!rdoc) throw new RecordNotFoundError(rid);
    return rdoc;
}
async function getMany(query, sort, page, limit) {
    return await coll.find(query).sort(sort).skip((page - 1) * limit).limit(limit).toArray();
}
async function update(rid, $set) {
    let _id = new ObjectID(rid);
    await coll.findOneAndUpdate({ _id }, { $set });
    let rdoc = await coll.findOne({ _id });
    if (!rdoc) throw new RecordNotFoundError(rid);
    return rdoc;
}
async function reset(rid) {
    return await update(rid, {
        score: 0,
        status: STATUS_WAITING,
        time: 0,
        memory: 0,
        cases: [],
        judgeTexts: [],
        compilerTexts: [],
        judgeAt: null,
        judger: null
    });
}
async function count(query) {
    return await coll.find(query).count();
}
async function getList(rids) {
    let r = {};
    for (let rid of rids) r[rid] = await get(rid);
    return r;
}

module.exports = {
    add,
    get,
    getMany,
    update,
    count,
    reset,
    getList
};