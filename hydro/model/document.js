const assert = require('assert');
const { ObjectID } = require('bson');
const db = require('../service/db');

const coll = db.collection('document');
const collStatus = db.collection('document.status');

const TYPE_DOMAIN_ROLE = 0;
const TYPE_PROBLEM = 10;
const TYPE_PROBLEM_SOLUTION = 11;
const TYPE_PROBLEM_LIST = 12;
const TYPE_DISCUSSION_NODE = 20;
const TYPE_DISCUSSION = 21;
const TYPE_DISCUSSION_REPLY = 22;
const TYPE_CONTEST = 30;
const TYPE_TRAINING = 40;
const TYPE_FILE = 50;
const TYPE_HOMEWORK = 60;

async function add(
    domainId, content, owner, docType, docId = null,
    parentType = null, parentId = null, args = {},
) {
    const _id = new ObjectID();
    const doc = {
        _id,
        content,
        owner,
        domainId,
        docType,
        docId: docId || _id,
        ...args,
    };
    if (parentType || parentId) {
        assert(parentType && parentId);
        doc.parentType = parentType;
        doc.parentId = parentId;
    }
    const res = await coll.insertOne(doc);
    return docId || res.insertedId;
}

function get(domainId, docType, docId) {
    return coll.findOne({ domainId, docType, docId });
}

async function set(domainId, docType, docId, args) {
    const res = await coll.findOneAndUpdate(
        { domainId, docType, docId },
        { $set: args },
        { returnOriginal: false },
    );
    return res.value;
}

function deleteOne(domainId, docType, docId) {
    return Promise.all([
        coll.deleteMany({ domainId, docType, docId }),
        coll.deleteOne({ domainId, docType, docId }),
    ]);
}

function deleteMulti(domainId, docType, args = {}) {
    return coll.deleteMany({ ...args, domainId, docType });
}

function deleteMultiStatus(domainId, docType, args = {}) {
    return collStatus.deleteMany({ ...args, domainId, docType });
}

function getMulti(domainId, docType, args = {}) {
    return coll.find({ ...args, docType, domainId });
}

async function inc(domainId, docType, docId, key, value) {
    const res = await coll.findOneAndUpdate(
        { domainId, docType, docId },
        { $inc: { [key]: value } },
        { returnOriginal: false },
    );
    return res.value;
}

async function incAndSet(domainId, docType, docId, key, value, args) {
    const res = await coll.findOneAndUpdate(
        { domainId, docType, docId },
        { $inc: { [key]: value }, $set: args },
        { returnOriginal: false },
    );
    return res.value;
}

function count(domainId, docType, query) {
    return coll.find({ ...query, docType, domainId }).count();
}

async function push(domainId, docType, docId, key, content, owner, args) {
    const _id = new ObjectID();
    const doc = await coll.findOneAndUpdate(
        { domainId, docType, docId },
        {
            $push: {
                [key]: {
                    ...args, content, owner, _id,
                },
            },
        },
        { returnOriginal: false },
    );
    return [doc.value, _id];
}

async function pull(domainId, docType, docId, setKey, contents) {
    const res = await coll.findOneAndUpdate(
        { domainId, docType, docId },
        { $pull: { [setKey]: { $in: contents } } },
        { returnOriginal: false },
    );
    return res.value;
}

async function deleteSub(domainId, docType, docId, key, subId) {
    const res = await coll.findOneAndUpdate(
        { domainId, docType, docId },
        { $pull: { [key]: { _id: subId } } },
        { returnOriginal: false },
    );
    return res.value;
}

async function getSub(domainId, docType, docId, key, subId) {
    const doc = await coll.findOne({
        domainId,
        docType,
        docId,
        [key]: { $elemMatch: { _id: subId } },
    });
    if (!doc) return [null, null];
    for (const sdoc of doc[key] || []) {
        if (sdoc._id === subId) return [doc, sdoc];
    }
    return [doc, null];
}

async function setSub(domainId, docType, docId, key, subId, args) {
    const $set = {};
    for (const k in args) {
        $set[`${key}.$.${k}`] = args[k];
    }
    const res = await coll.findOneAndUpdate(
        {
            domainId,
            docType,
            docId,
            [key]: { $elemMatch: { _id: subId } },
        },
        { $set },
        { returnOriginal: false },
    );
    return res.value;
}

async function addToSet(domainId, docType, docId, setKey, content) {
    const res = await coll.findOneAndUpdate(
        { domainId, docType, docId },
        { $addToSet: { [setKey]: content } },
        { returnOriginal: false },
    );
    return res.value;
}

function getStatus(domainId, docType, docId, uid) {
    return collStatus.findOne({
        domainId, docType, docId, uid,
    });
}

function getMultiStatus(domainId, docType, args) {
    return collStatus.find({ ...args, docType, domainId });
}

async function setStatus(domainId, docType, docId, uid, args) {
    const res = await collStatus.findOneAndUpdate(
        {
            domainId, docType, docId, uid,
        },
        { $set: args },
        { upsert: true, returnOriginal: false },
    );
    return res.value;
}

async function setIfNotStatus(domainId, docType, docId, uid, key, value, ifNot, args) {
    const res = await collStatus.findOneAndUpdate(
        {
            domainId, docType, docId, uid, key: { $not: { $eq: ifNot } },
        },
        { $set: { [key]: value, args } },
        { upsert: true, returnOriginal: false },
    );
    return res.value;
}

async function cappedIncStatus(
    domainId, docType, docId, uid,
    key, value, minValue = -1, maxValue = 1,
) {
    assert(value !== 0);
    const $not = value > 0 ? { $gte: maxValue } : { $lte: minValue };
    const res = await collStatus.findOneAndUpdate(
        {
            domainId, docType, docId, uid, [key]: { $not },
        },
        { $inc: { [key]: value } },
        { upsert: true, returnOriginal: false },
    );
    return res.value;
}

async function incStatus(domainId, docType, docId, uid, key, value) {
    const res = await collStatus.findOneAndUpdate(
        {
            domainId, docType, docId, uid,
        },
        { $inc: { [key]: value } },
        { upsert: true, returnOriginal: false },
    );
    return res.value;
}

async function revPushStatus(domainId, docType, docId, uid, key, value) {
    const res = await collStatus.findOneAndUpdate(
        {
            domainId, docType, docId, uid,
        },
        { $push: { [key]: value }, $inc: { rev: 1 } },
        { upsert: true, returnOriginal: false },
    );
    return res.value;
}

async function revInitStatus(domainId, docType, docId, uid) {
    const res = await collStatus.findOneAndUpdate(
        {
            domainId, docType, docId, uid,
        },
        { $inc: { rev: 1 } },
        { upsert: true, returnOriginal: false },
    );
    return res.value;
}

async function revSetStatus(domainId, docType, docId, uid, rev, args, returnDoc = true) {
    const filter = {
        domainId, docType, docId, uid, rev,
    };
    const update = { $set: args, $inc: { rev: 1 } };
    if (returnDoc) {
        const res = await coll.findOneAndUpdate(filter, update, { returnOriginal: false });
        return res.value;
    }
    const res = await coll.updateOne(filter, update);
    return res;
}

async function ensureIndexes() {
    await coll.createIndex({ domainId: 1, docType: 1, docId: 1 }, { unique: true });
    await coll.createIndex({
        domainId: 1, docType: 1, owner: 1, docId: -1,
    });
    // For problem
    await coll.createIndex({
        domainId: 1, docType: 1, category: 1, docId: 1,
    }, { sparse: true });
    await coll.createIndex({
        domainId: 1, docType: 1, hidden: 1, category: 1, docId: 1,
    }, { sparse: true });
    await coll.createIndex({
        domainId: 1, docType: 1, tag: 1, docId: 1,
    }, { sparse: true });
    await coll.createIndex({
        domainId: 1, docType: 1, hidden: 1, tag: 1, docId: 1,
    }, { sparse: true });
    // For problem solution
    await coll.createIndex({
        domainId: 1, docType: 1, parentType: 1, parentId: 1, vote: -1, docId: -1,
    }, { sparse: true });
    // For discussion
    await coll.createIndex({
        domainId: 1, docType: 1, updateAt: -1, docId: -1,
    }, { sparse: true });
    await coll.createIndex({
        domainId: 1, docType: 1, parentType: 1, parentId: 1, updateAt: -1, docId: -1,
    }, { sparse: true });
    // Hidden doc
    await coll.createIndex({
        domainId: 1, docType: 1, hidden: 1, docId: -1,
    }, { sparse: true });
    // For contest
    await coll.createIndex({ domainId: 1, docType: 1, pids: 1 }, { sparse: true });
    await coll.createIndex({
        domainId: 1, docType: 1, rule: 1, docId: -1,
    }, { sparse: true });
    // For training
    await coll.createIndex({ domainId: 1, docType: 1, 'dag.pids': 1 }, { sparse: true });

    await collStatus.createIndex({
        domainId: 1, docType: 1, uid: 1, docId: 1,
    }, { unique: true });
    // For rp system
    await collStatus.createIndex({
        domainId: 1, docType: 1, docId: 1, status: 1, rid: 1, rp: 1,
    }, { sparse: true });
    // For contest rule OI
    await collStatus.createIndex({
        domainId: 1, docType: 1, docId: 1, score: -1,
    }, { sparse: true });
    // For contest rule ACM
    await collStatus.createIndex({
        domainId: 1, docType: 1, docId: 1, accept: -1, time: 1,
    }, { sparse: true });
    // For training
    await collStatus.createIndex({
        domainId: 1, docType: 1, uid: 1, enroll: 1, docId: 1,
    }, { sparse: true });
}

global.Hydro.model.document = module.exports = {
    add,
    addToSet,
    cappedIncStatus,
    count,
    deleteMulti,
    deleteMultiStatus,
    deleteOne,
    deleteSub,
    ensureIndexes,
    get,
    getMulti,
    getMultiStatus,
    getStatus,
    getSub,
    inc,
    incAndSet,
    incStatus,
    pull,
    push,
    revInitStatus,
    revPushStatus,
    revSetStatus,
    set,
    setIfNotStatus,
    setStatus,
    setSub,

    TYPE_DOMAIN_ROLE,
    TYPE_CONTEST,
    TYPE_DISCUSSION,
    TYPE_DISCUSSION_NODE,
    TYPE_DISCUSSION_REPLY,
    TYPE_HOMEWORK,
    TYPE_PROBLEM,
    TYPE_PROBLEM_LIST,
    TYPE_PROBLEM_SOLUTION,
    TYPE_FILE,
    TYPE_TRAINING,
};
