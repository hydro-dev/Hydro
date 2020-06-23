const document = require('./document');
const { TrainingNotFoundError, TrainingAlreadyEnrollError } = require('../error');

function getStatus(domainId, tid, uid) {
    return document.getStatus(domainId, document.TYPE_TRAINING, tid, uid);
}

function getMultiStatus(domainId, query) {
    return document.getMultiStatus(domainId, document.TYPE_TRAINING, query);
}

async function getListStatus(domainId, uid, tids) {
    const tsdocs = await getMultiStatus(
        domainId, { uid, tid: { $in: Array.from(new Set(tids)) } },
    ).toArray();
    const r = {};
    for (const tsdoc of tsdocs) r[tsdoc.pid] = tsdoc;
    return r;
}

async function enroll(domainId, tid, uid) {
    try {
        await document.setStatus(domainId, document.TYPE_TRAINING, tid, uid, { enroll: 1 });
    } catch (e) {
        throw new TrainingAlreadyEnrollError(tid, uid);
    }
    return await document.inc(domainId, document.TYPE_TRAINING, tid, 'enroll', 1);
}

function setStatus(domainId, tid, uid, $set) {
    return document.setStatus(domainId, document.TYPE_TRAINING, tid, uid, $set);
}

function add(domainId, title, content, owner, dag = [], description = '') {
    return document.add(domainId, content, owner, document.TYPE_TRAINING, null, null, null, {
        dag,
        title,
        description,
        enroll: 0,
    });
}

function edit(domainId, tid, $set) {
    return document.set(domainId, document.TYPE_TRAINING, tid, $set);
}

global.Hydro.model.training = module.exports = {
    getPids(tdoc) {
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
    add,
    edit,
    count: (domainId, query) => document.count(domainId, document.TYPE_TRAINING, query),
    async get(domainId, tid) {
        const tdoc = await document.get(domainId, document.TYPE_TRAINING, tid);
        if (!tdoc) throw new TrainingNotFoundError(tid);
        for (const i in tdoc.dag) {
            for (const j in tdoc.dag[i].pids) {
                if (Number.isSafeInteger(parseInt(tdoc.dag[i].pids[j], 10))) {
                    tdoc.dag[i].pids[j] = parseInt(tdoc.dag[i].pids[j], 10);
                }
            }
        }
        return tdoc;
    },
    async getList(domainId, tids) {
        const tdocs = await this.getMulti(
            domainId, { _id: { $in: Array.from(new Set(tids)) } },
        ).toArray();
        const r = {};
        for (const tdoc of tdocs) r[tdoc.docId] = tdoc;
        return r;
    },
    getMulti: (domainId, query) => document.getMulti(domainId, document.TYPE_TRAINING, query),
    getMultiStatus,
    getStatus,
    enroll,
    setStatus,
    getListStatus,
};
