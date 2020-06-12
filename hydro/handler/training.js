const assert = require('assert');
const { ValidationError, ProblemNotFoundError } = require('../error');
const {
    PERM_LOGGEDIN, PERM_VIEW_TRAINING, PERM_VIEW_PROBLEM_HIDDEN,
    PERM_CREATE_TRAINING, PERM_EDIT_TRAINING,
} = require('../permission');
const paginate = require('../lib/paginate');
const problem = require('../model/problem');
const builtin = require('../model/builtin');
const training = require('../model/training');
const user = require('../model/user');
const system = require('../model/system');
const { Route, Handler } = require('../service/server');

async function _parseDagJson(domainId, dag) {
    const parsed = [];
    try {
        dag = JSON.parse(dag);
        assert(dag instanceof Array, 'dag must be an array');
        const ids = new Set(dag.map((s) => s._id));
        assert(dag.length === ids.size, '_id must be unique');
        for (const node of dag) {
            assert(node._id, 'each node should have a _id');
            assert(node.title, 'each node shoule have a title');
            assert(node.requireNids instanceof Array);
            assert(node.pids instanceof Array);
            assert(node.pids.length);
            for (const nid of node.requireNids) {
                assert(ids.has(nid), `required nid ${nid} not found`);
            }
            for (const i in node.pids) {
                // eslint-disable-next-line no-await-in-loop
                const pdoc = await problem.get(domainId, node.pids[i]); // FIXME no-await-in-loop
                assert(pdoc, `Problem not found: ${node.pids[i]}`);
                node.pids[i] = pdoc.docId;
            }
            const newNode = {
                _id: parseInt(node._id),
                title: node.title,
                requireNids: Array.from(new Set(node.requireNids)),
                pids: Array.from(new Set(node.pids)),
            };
            parsed.push(newNode);
        }
    } catch (e) {
        throw new ValidationError('dag', [e.message]);
    }
    return parsed;
}

class TrainingHandler extends Handler {
    async _prepare() {
        this.checkPerm(PERM_VIEW_TRAINING);
    }
}

class TrainingMainHandler extends TrainingHandler {
    async get({ domainId, sort, page }) {
        const qs = sort ? 'sort={0}'.format(sort) : '';
        const [tdocs, tpcount] = await paginate(
            training.getMulti(domainId).sort('_id', 1),
            page,
            await system.get('TRAINING_PER_PAGE'),
        );
        const tids = new Set();
        for (const tdoc of tdocs) tids.add(tdoc.docId);
        const tsdict = {};
        let tdict = {};
        if (this.user.hasPerm(PERM_LOGGEDIN)) {
            const enrolledTids = new Set();
            const tsdocs = await training.getMultiStatus(domainId, {
                uid: this.user._id,
                $or: [{ docId: { $in: Array.from(tids) } }, { enroll: 1 }],
            }).toArray();
            for (const tsdoc of tsdocs) {
                tsdict[tsdoc.docId] = tsdoc;
                enrolledTids.add(tsdoc.docId);
            }
            for (const tid of tids) enrolledTids.delete(tid);
            if (enrolledTids.size) {
                tdict = await training.getList(domainId, Array.from(enrolledTids));
            }
        }
        for (const tdoc in tdocs) tdict[tdoc.docId] = tdoc;
        const path = [
            ['Hydro', '/'],
            ['training_main', null],
        ];
        this.response.template = 'training_main.html';
        this.response.body = {
            tdocs, page, tpcount, qs, tsdict, tdict, path,
        };
    }
}

class TrainingDetailHandler extends TrainingHandler {
    async get({ domainId, tid }) {
        const tdoc = await training.get(domainId, tid);
        const pids = training.getPids(tdoc);
        const f = this.user.hasPerm(PERM_VIEW_PROBLEM_HIDDEN) ? {} : { hidden: false };
        const [udoc, pdict] = await Promise.all([
            user.getById(domainId, tdoc.owner),
            problem.getList(domainId, pids, f),
        ]);
        const psdict = await problem.getListStatus(domainId, this.user._id, pids);
        const donePids = new Set();
        const progPids = new Set();
        for (const pid in psdict) {
            const psdoc = psdict[pid];
            if (psdoc.status) {
                if (psdoc.status === builtin.STATUS.STATUS_ACCEPTED) donePids.add(parseInt(pid));
                else progPids.add(parseInt(pid));
            }
        }
        const nsdict = {};
        const ndict = {};
        const doneNids = new Set();
        for (const node of tdoc.dag) {
            ndict[node._id] = node;
            const totalCount = node.pids.length;
            const doneCount = Set.union(new Set(node.pids), donePids).size;
            const nsdoc = {
                progress: totalCount ? parseInt(100 * (doneCount / totalCount)) : 100,
                isDone: training.isDone(node, doneNids, donePids),
                isProgress: training.isProgress(node, doneNids, donePids, progPids),
                isOpen: training.isOpen(node, doneNids, donePids, progPids),
                isInvalid: training.isInvalid(node, doneNids),
            };
            if (nsdoc.isDone) doneNids.add(node._id);
            nsdict[node._id] = nsdoc;
        }
        const tsdoc = await training.setStatus(domainId, tdoc.docId, this.user._id, {
            doneNids: Array.from(doneNids),
            donePids: Array.from(donePids),
            done: doneNids.size === tdoc.dag.length,
        });
        const path = [
            ['training_main', 'training_main'],
            [tdoc.title, null, true],
        ];
        this.response.template = 'training_detail.html';
        this.response.body = {
            path, tdoc, tsdoc, pids, pdict, psdict, ndict, nsdict, udoc,
        };
    }

    async postEnroll({ domainId, tid }) {
        this.checkPerm(PERM_LOGGEDIN);
        const tdoc = await training.get(domainId, tid);
        await training.enroll(domainId, tdoc.docId, this.user._id);
        this.back();
    }
}

class TrainingCreateHandler extends TrainingHandler {
    async get() {
        const path = [
            ['Hydro', '/'],
            ['problem_main', '/t'],
            ['problem_create', null],
        ];
        this.response.template = 'training_edit.html';
        this.response.body = { page_name: 'training_create', path };
    }

    async post({
        domainId, title, content, dag, description,
    }) {
        dag = await _parseDagJson(domainId, dag);
        const pids = training.getPids({ dag });
        assert(pids.length, new ValidationError('dag'));
        const pdocs = await problem.getMulti(domainId, {
            $or: [{ docId: { $in: pids } }, { pid: { $in: pids } }],
        }).sort('_id', 1).toArray();
        const existPids = pdocs.map((pdoc) => pdoc.docId);
        const existPnames = pdocs.map((pdoc) => pdoc.pid);
        if (pids.length !== existPids.length) {
            for (const pid of pids) {
                assert(
                    existPids.includes(pid) || existPnames.includes(pid),
                    new ProblemNotFoundError(pid),
                );
            }
        }
        for (const pdoc in pdocs) {
            if (pdoc.hidden) this.checkPerm(PERM_VIEW_PROBLEM_HIDDEN);
        }
        const tid = await training.add(domainId, title, content, this.user._id, dag, description);
        this.response.body = { tid };
        this.response.redirect = `/t/${tid}`;
    }
}

class TrainingEditHandler extends TrainingHandler {
    async get({ domainId, tid }) {
        const tdoc = await training.get(domainId, tid);
        if (tdoc.owner !== this.user._id) this.checkPerm(PERM_EDIT_TRAINING);
        const dag = JSON.stringify(tdoc.dag, null, 2);
        const path = [
            ['training_main', '/t'],
            [tdoc.title, `/t/${tdoc.docId}`, true],
            ['training_edit', null],
        ];
        this.response.template = 'training_edit.html';
        this.response.body = {
            tdoc, dag, path, page_name: 'training_edit',
        };
    }

    async post({
        domainId, tid, title, content, dag, description,
    }) {
        const tdoc = await training.get(domainId, tid);
        if (!this.user._id === tdoc.owner) this.checkPerm(PERM_EDIT_TRAINING);
        dag = await _parseDagJson(domainId, dag);
        const pids = training.getPids({ dag });
        assert(pids.length, new ValidationError('dag'));
        const pdocs = await problem.getMulti(domainId, {
            $or: [
                { docId: { $in: pids } },
                { pid: { $in: pids } },
            ],
        }).sort('_id', 1).toArray();
        const existPids = pdocs.map((pdoc) => pdoc.docId);
        const existPnames = pdocs.map((pdoc) => pdoc.pid);
        if (pids.length !== existPids.length) {
            for (const pid in pids) {
                assert(
                    existPids.includes(pid) || existPnames.includes(pid),
                    new ProblemNotFoundError(pid),
                );
            }
        }
        for (const pdoc in pdocs) {
            if (pdoc.hidden) this.checkPerm(PERM_VIEW_PROBLEM_HIDDEN);
        }
        await training.edit(domainId, tid, {
            title, content, dag, description,
        });
        this.response.body = { tid };
        this.response.redirect = `/t/${tid}`;
    }
}

async function apply() {
    Route('training_main', '/training', TrainingMainHandler);
    Route('training_create', '/training/create', TrainingCreateHandler, PERM_CREATE_TRAINING);
    Route('training_detail', '/training/:tid', TrainingDetailHandler);
    Route('training_edit', '/training/:tid/edit', TrainingEditHandler);
}

global.Hydro.handler.training = module.exports = apply;
