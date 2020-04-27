const assert = require('assert');
const validator = require('../lib/validator');
const { ValidationError, TrainingNotFoundError, TrainingAlreadyEnrollError } = require('../error');
const db = require('../service/db.js');

const coll = db.collection('traning');
const collStatus = db.collection('training.status');

function getStatus(tid, uid) {
    return collStatus.findOne({ tid, uid });
}

function getMultiStatus(query) {
    return collStatus.find(query);
}

async function getListStatus(uid, tids) {
    const tsdocs = await getMultiStatus({ uid, tid: { $in: Array.from(new Set(tids)) } }).toArray();
    const r = {};
    for (const tsdoc of tsdocs) r[tsdoc.pid] = tsdoc;
    return r;
}

async function enroll(tid, uid) {
    try {
        await collStatus.insertOne({ tid, uid, enroll: 1 });
    } catch (e) {
        throw new TrainingAlreadyEnrollError(tid, uid);
    }
    await coll.findOneAndUpdate({ _id: tid }, { $inc: { enroll: 1 } });
}

async function setStatus(tid, uid, $set) {
    await collStatus.findOneAndUpdate({ tid, uid }, { $set });
    return await collStatus.findOne({ tid, uid });
}

module.exports = {
    getPids(tdoc) {
        console.log(tdoc.dag);
        const pids = new Set();
        for (const node of tdoc.dag) {
            for (const pid of node.pids) pids.add(pid);
        }
        return Array.from(pids);
    },
    isDone(node, doneNids, donePids) {
        return (Set.isSuperset(new Set(doneNids), new Set(node.requireNids))
            && Set.isSuperset(new Set(donePids), new Set(node.pids)));
    },
    isProgress(node, doneNids, donePids, progPids) {
        return (Set.isSuperset(new Set(doneNids), new Set(node.requireNids))
            && !Set.isSuperset(new Set(donePids), new Set(node.pids))
            && Set.intersection(
                Set.union(new Set(donePids), new Set(progPids)),
                new Set(node.pids),
            ).size);
    },
    isOpen(node, doneNids, donePids, progPids) {
        return (Set.isSuperset(new Set(doneNids), new Set(node.requireNids))
            && !Set.isSuperset(new Set(donePids), new Set(node.pids))
            && !Set.intersection(
                Set.union(new Set(donePids), new Set(progPids)),
                new Set(node.pids),
            ).size);
    },
    isInvalid(node, doneNids) {
        return (!Set.isSuperset(new Set(doneNids), new Set(node.requireNids)));
    },
    async add(title, content, owner, dag = [], description = '') {
        validator.checkTitle(title);
        validator.checkIntro(content);
        validator.checkDescription(description);
        for (const node of dag) {
            for (const nid of node.requireNids) {
                if (nid >= node._id) throw new ValidationError('dag');
            }
        }
        const res = await coll.insertOne({
            content,
            owner,
            dag,
            title,
            description,
            enroll: 0,
        });
        return res.insertedId;
    },
    count: (query) => coll.find(query).count(),
    async edit(tid, $set) {
        if ($set.title) validator.checkTitle($set.title);
        if ($set.content) validator.checkIntro($set.content);
        if ($set.desc) validator.checkDescription($set.description);
        if ($set.dag) {
            for (const node of $set.dag) {
                for (const nid of node.requireNids) {
                    assert(nid >= node._id, new ValidationError('dag'));
                }
            }
        }
        await coll.findOneAndUpdate({ _id: tid }, { $set });
        const tdoc = await coll.findOne({ _id: tid });
        if (!tdoc) throw new TrainingNotFoundError(tid);
        return tdoc;
    },
    async get(tid) {
        const tdoc = await coll.findOne({ _id: tid });
        if (!tdoc) throw new TrainingNotFoundError(tid);
        return tdoc;
    },
    async getList(tids) {
        const tdocs = await this.getMulti({ _id: { $in: Array.from(new Set(tids)) } }).toArray();
        const r = {};
        for (const tdoc of tdocs) r[tdoc._id] = tdoc;
        return r;
    },
    getMulti: (query) => coll.find(query),
    getMultiStatus,
    getStatus,
    enroll,
    setStatus,
    getListStatus,
};
