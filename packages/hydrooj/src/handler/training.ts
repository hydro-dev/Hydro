import assert from 'assert';
import { FilterQuery, ObjectID } from 'mongodb';
import { ProblemNotFoundError, ValidationError } from '../error';
import { Tdoc, TrainingDoc } from '../interface';
import paginate from '../lib/paginate';
import { isContent, isDescription } from '../lib/validator';
import { PERM, PRIV } from '../model/builtin';
import * as builtin from '../model/builtin';
import problem from '../model/problem';
import * as system from '../model/system';
import * as training from '../model/training';
import user from '../model/user';
import * as bus from '../service/bus';
import {
    Handler, param,
    Route, Types } from '../service/server';

async function _parseDagJson(domainId: string, _dag: string): Promise<Tdoc['dag']> {
    const parsed = [];
    try {
        const dag = JSON.parse(_dag);
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
            const tasks = [];
            for (const i in node.pids) {
                tasks.push(problem.get(domainId, node.pids[i]).then((pdoc) => {
                    if (!pdoc) throw new ProblemNotFoundError(domainId, node.pids[i]);
                    node.pids[i] = pdoc.docId;
                }));
            }
            // FIXME no-await-in-loop
            // eslint-disable-next-line no-await-in-loop
            await Promise.all(tasks);
            const newNode = {
                _id: parseInt(node._id, 10),
                title: node.title,
                requireNids: Array.from(new Set(node.requireNids)),
                pids: Array.from(new Set(node.pids)),
            };
            parsed.push(newNode);
        }
    } catch (e) {
        throw new ValidationError('dag', null, e.message);
    }
    return parsed;
}

class TrainingMainHandler extends Handler {
    @param('page', Types.PositiveInt, true)
    async get(domainId: string, page = 1) {
        const query: FilterQuery<TrainingDoc> = {};
        await bus.serial('training/list', query, this);
        const [tdocs, tpcount] = await paginate(
            training.getMulti(domainId),
            page,
            system.get('pagination.training'),
        );
        const tids: Set<ObjectID> = new Set();
        for (const tdoc of tdocs) tids.add(tdoc.docId);
        const tsdict = {};
        let tdict = {};
        if (this.user.hasPriv(PRIV.PRIV_USER_PROFILE)) {
            const enrolledTids: Set<ObjectID> = new Set();
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
        for (const tdoc of tdocs) tdict[tdoc.docId.toHexString()] = tdoc;
        const path = [
            ['Hydro', 'homepage'],
            ['training_main', null],
        ];
        this.response.template = 'training_main.html';
        this.response.body = {
            tdocs, page, tpcount, tsdict, tdict, path,
        };
    }
}

class TrainingDetailHandler extends Handler {
    @param('tid', Types.ObjectID)
    async get(domainId: string, tid: ObjectID) {
        const tdoc = await training.get(domainId, tid);
        await bus.serial('training/get', tdoc, this);
        const pids = training.getPids(tdoc.dag);
        const [owner, pdict] = await Promise.all([
            user.getById(domainId, tdoc.owner),
            problem.getList(domainId, pids, this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN) || this.user._id),
        ]);
        const psdict = await problem.getListStatus(domainId, this.user._id, pids);
        const donePids = new Set<number>();
        const progPids = new Set<number>();
        for (const pid in psdict) {
            const psdoc = psdict[pid];
            if (psdoc.status) {
                if (psdoc.status === builtin.STATUS.STATUS_ACCEPTED) {
                    donePids.add(parseInt(pid, 10));
                } else progPids.add(parseInt(pid, 10));
            }
        }
        const nsdict = {};
        const ndict = {};
        const doneNids = new Set<number>();
        for (const node of tdoc.dag) {
            ndict[node._id] = node;
            const totalCount = node.pids.length;
            const doneCount = Set.intersection(new Set(node.pids), donePids).size;
            const nsdoc = {
                progress: totalCount ? Math.floor(100 * (doneCount / totalCount)) : 100,
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
            ['Hydro', 'homepage'],
            ['training_main', 'training_main'],
            [tdoc.title, null, null, true],
        ];
        this.response.template = 'training_detail.html';
        this.response.body = {
            path, tdoc, tsdoc, pids, pdict, psdict, ndict, nsdict, owner,
        };
    }

    @param('tid', Types.ObjectID)
    async postEnroll(domainId: string, tid: ObjectID) {
        this.checkPriv(PRIV.PRIV_USER_PROFILE);
        const tdoc = await training.get(domainId, tid);
        await training.enroll(domainId, tdoc.docId, this.user._id);
        this.back();
    }

    @param('tid', Types.ObjectID)
    async postDelete(domainId: string, tid: ObjectID) {
        const tdoc = await training.get(domainId, tid);
        if (!this.user.own(tdoc)) this.checkPerm(PERM.PERM_EDIT_TRAINING);
        await training.del(domainId, tid);
        this.response.redirect = this.url('training_main');
    }
}

class TrainingCreateHandler extends Handler {
    async get() {
        const path = [
            ['Hydro', 'homepage'],
            ['training_main', 'training_main'],
            ['training_create', null],
        ];
        this.response.template = 'training_edit.html';
        this.response.body = { page_name: 'training_create', path };
    }

    @param('title', Types.Title)
    @param('content', Types.Content)
    @param('dag', Types.String, isContent)
    @param('pin', Types.Boolean)
    @param('description', Types.String, isDescription)
    async post(
        domainId: string, title: string, content: string,
        _dag: string, pin = false, description: string,
    ) {
        if (pin) this.checkPerm(PERM.PERM_PIN_TRAINING);
        const dag = await _parseDagJson(domainId, _dag);
        const pids = training.getPids(dag);
        assert(pids.length, new ValidationError('dag'));
        const pdocs = await problem.getMulti(domainId, { docId: { $in: pids } }).sort('_id', 1).toArray();
        for (const pdoc of pdocs) {
            if (pdoc.hidden) this.checkPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN);
        }
        const tid = await training.add(domainId, title, content, this.user._id, dag, description);
        if (pin) await training.edit(domainId, tid, { pin });
        this.response.body = { tid };
        this.response.redirect = this.url('training_detail', { tid });
    }
}

class TrainingEditHandler extends Handler {
    tdoc: TrainingDoc;

    @param('tid', Types.ObjectID)
    async prepare(domainId: string, tid: ObjectID) {
        this.tdoc = await training.get(domainId, tid);
        if (!this.user.own(this.tdoc)) this.checkPerm(PERM.PERM_EDIT_TRAINING);
        else this.checkPerm(PERM.PERM_EDIT_TRAINING_SELF);
    }

    async get({ tid }) {
        const dag = JSON.stringify(this.tdoc.dag, null, 2);
        const path = [
            ['Hydro', 'homepage'],
            ['training_main', 'training_main'],
            [this.tdoc.title, 'training_detail', { tid }, true],
            ['training_edit', null],
        ];
        this.response.template = 'training_edit.html';
        this.response.body = {
            tdoc: this.tdoc, dag, path, page_name: 'training_edit',
        };
    }

    @param('tid', Types.ObjectID)
    @param('title', Types.Title)
    @param('content', Types.Content)
    @param('dag', Types.Content)
    @param('pin', Types.Boolean)
    @param('description', Types.String, isDescription)
    async post(
        domainId: string, tid: ObjectID,
        title: string, content: string,
        _dag: string, pin = false, description: string,
    ) {
        if ((!!this.tdoc.pin) !== pin) this.checkPerm(PERM.PERM_PIN_TRAINING);
        const dag = await _parseDagJson(domainId, _dag);
        const pids = training.getPids(dag);
        assert(pids.length, new ValidationError('dag'));
        const pdocs = await problem.getMulti(domainId, {
            $or: [
                { docId: { $in: pids } },
                // TODO
                // @ts-ignore
                { pid: { $in: pids } },
            ],
        }).sort('_id', 1).toArray();
        const existPids = pdocs.map((pdoc) => pdoc.docId);
        if (pids.length !== existPids.length) {
            for (const pid in pids) {
                assert(
                    existPids.includes(parseInt(pid, 10)),
                    new ProblemNotFoundError(pid),
                );
            }
        }
        for (const pdoc of pdocs) {
            if (pdoc.hidden) this.checkPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN);
        }
        await training.edit(domainId, tid, {
            title, content, dag, description, pin,
        });
        this.response.body = { tid };
        this.response.redirect = this.url('training_detail', { tid });
    }
}

export async function apply() {
    Route('training_main', '/training', TrainingMainHandler, PERM.PERM_VIEW_TRAINING);
    Route('training_create', '/training/create', TrainingCreateHandler, PERM.PERM_CREATE_TRAINING);
    Route('training_detail', '/training/:tid', TrainingDetailHandler, PERM.PERM_VIEW_TRAINING);
    Route('training_edit', '/training/:tid/edit', TrainingEditHandler);
}

global.Hydro.handler.training = apply;
