import assert from 'assert';
import { pick } from 'lodash';
import { Filter, ObjectId } from 'mongodb';
import { sortFiles } from '@hydrooj/utils/lib/utils';
import {
    FileLimitExceededError, FileUploadError, ProblemNotFoundError, ValidationError,
} from '../error';
import { Tdoc, TrainingDoc } from '../interface';
import { PERM, PRIV, STATUS } from '../model/builtin';
import * as oplog from '../model/oplog';
import problem from '../model/problem';
import storage from '../model/storage';
import system from '../model/system';
import * as training from '../model/training';
import user from '../model/user';
import {
    Handler, param, post, Types,
} from '../service/server';

async function _parseDagJson(domainId: string, _dag: string): Promise<Tdoc['dag']> {
    const parsed = [];
    try {
        const dag = JSON.parse(_dag);
        assert(dag instanceof Array, 'dag must be an array');
        const ids = new Set(dag.map((s) => s._id));
        assert(dag.length, 'must have at least one node');
        assert(dag.length === ids.size, '_id must be unique');
        for (const node of dag) {
            assert(node._id, 'each node should have a _id');
            assert(node.title, 'each node shoule have a title');
            assert(node.requireNids instanceof Array);
            assert(node.pids instanceof Array);
            assert(node.pids.length, 'each node must contain at lease one problem');
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
            // eslint-disable-next-line no-await-in-loop
            await Promise.all(tasks);
            const newNode = {
                _id: +node._id,
                title: node.title,
                requireNids: Array.from(new Set(node.requireNids)),
                pids: Array.from(new Set(node.pids)),
            };
            parsed.push(newNode);
        }
    } catch (e) {
        throw new ValidationError('dag', null, e instanceof ProblemNotFoundError ? e : e.message);
    }
    return parsed;
}

class TrainingMainHandler extends Handler {
    @param('page', Types.PositiveInt, true)
    async get(domainId: string, page = 1) {
        const query: Filter<TrainingDoc> = {};
        await this.ctx.parallel('training/list', query, this);
        const [tdocs, tpcount] = await this.paginate(
            training.getMulti(domainId),
            page,
            'training',
        );
        const tids: Set<ObjectId> = new Set();
        for (const tdoc of tdocs) tids.add(tdoc.docId);
        const tsdict = {};
        let tdict = {};
        if (this.user.hasPriv(PRIV.PRIV_USER_PROFILE)) {
            const enrolledTids: Set<ObjectId> = new Set();
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
        this.response.template = 'training_main.html';
        this.response.body = {
            tdocs, page, tpcount, tsdict, tdict,
        };
    }
}

class TrainingDetailHandler extends Handler {
    @param('tid', Types.ObjectId)
    @param('uid', Types.PositiveInt, true)
    async get(domainId: string, tid: ObjectId, uid = this.user._id) {
        const tdoc = await training.get(domainId, tid);
        await this.ctx.parallel('training/get', tdoc, this);
        let enrollUsers: number[] = [];
        let shouldCompare = false;
        const pids = training.getPids(tdoc.dag);
        if (this.user.hasPriv(PRIV.PRIV_USER_PROFILE) && this.ctx.setting.get('training.enrolled-users')) {
            enrollUsers = (await training.getMultiStatus(domainId, { docId: tid, uid: { $gt: 1 }, enroll: 1 })
                .project({ uid: 1 }).limit(500).toArray()).map((x) => +x.uid);
            shouldCompare = uid !== this.user._id;
        } else uid = this.user._id;
        const canViewHidden = this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN) || this.user._id;
        const [udoc, udict, pdict, psdict, selfPsdict] = await Promise.all([
            user.getById(domainId, tdoc.owner),
            user.getListForRender(domainId, enrollUsers, this.user.hasPerm(PERM.PERM_VIEW_USER_PRIVATE_INFO)),
            problem.getList(domainId, pids, canViewHidden, true),
            problem.getListStatus(domainId, uid, pids),
            shouldCompare ? problem.getListStatus(domainId, this.user._id, pids) : {},
        ]);
        const donePids = new Set<number>();
        const progPids = new Set<number>();
        for (const pid in psdict) {
            if (!+pid) continue;
            const psdoc = psdict[pid];
            if (psdoc.status) {
                if (psdoc.status === STATUS.STATUS_ACCEPTED) donePids.add(+pid);
                else progPids.add(+pid);
            }
        }
        const nsdict = {};
        const ndict = {};
        const doneNids = new Set<number>();
        for (const node of tdoc.dag) {
            ndict[node._id] = node;
            const totalCount = node.pids.length;
            const doneCount = Set.intersection(node.pids, donePids).size;
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
        const tsdoc = await training.setStatus(domainId, tdoc.docId, uid, {
            doneNids: Array.from(doneNids),
            donePids: Array.from(donePids),
            done: doneNids.size === tdoc.dag.length,
        });
        const groups = this.user.hasPerm(PERM.PERM_EDIT_DOMAIN)
            ? await user.listGroup(domainId) : [];
        this.response.body = {
            tdoc, tsdoc, pids, pdict, psdict, ndict, nsdict, udoc, udict, selfPsdict, groups,
        };
        this.response.body.tdoc.description = this.response.body.tdoc.description
            .replace(/\(file:\/\//g, `(./${tdoc.docId}/file/`)
            .replace(/="file:\/\//g, `="./${tdoc.docId}/file/`);
        this.response.pjax = 'partials/training_detail.html';
        this.response.template = 'training_detail.html';
    }

    @param('tid', Types.ObjectId)
    async postEnroll(domainId: string, tid: ObjectId) {
        this.checkPriv(PRIV.PRIV_USER_PROFILE);
        const tdoc = await training.get(domainId, tid);
        await training.enroll(domainId, tdoc.docId, this.user._id);
        this.back();
    }

    @param('tid', Types.ObjectId)
    async postDelete(domainId: string, tid: ObjectId) {
        const tdoc = await training.get(domainId, tid);
        if (!this.user.own(tdoc)) this.checkPerm(PERM.PERM_EDIT_TRAINING);
        await Promise.all([
            training.del(domainId, tid),
            storage.del(tdoc.files?.map((i) => `training/${domainId}/${tid}/${i.name}`) || [], this.user._id),
        ]);
        this.response.redirect = this.url('training_main');
    }
}

class TrainingEditHandler extends Handler {
    tdoc: TrainingDoc;

    @param('tid', Types.ObjectId, true)
    async prepare(domainId: string, tid: ObjectId) {
        if (tid) {
            this.tdoc = await training.get(domainId, tid);
            if (!this.user.own(this.tdoc)) this.checkPerm(PERM.PERM_EDIT_TRAINING);
            else this.checkPerm(PERM.PERM_EDIT_TRAINING_SELF);
        } else this.checkPerm(PERM.PERM_CREATE_TRAINING);
    }

    async get() {
        this.response.template = 'training_edit.html';
        this.response.body = { page_name: this.tdoc ? 'training_edit' : 'training_create' };
        if (this.tdoc) {
            this.response.body.tdoc = this.tdoc;
            this.response.body.dag = JSON.stringify(this.tdoc.dag, null, 2);
        }
    }

    @param('tid', Types.ObjectId, true)
    @param('title', Types.Title)
    @param('content', Types.Content)
    @param('dag', Types.Content)
    @param('pin', Types.UnsignedInt)
    @param('description', Types.Content)
    async post(
        domainId: string, tid: ObjectId,
        title: string, content: string,
        _dag: string, pin = 0, description: string,
    ) {
        if ((!!this.tdoc?.pin) !== (!!pin)) this.checkPerm(PERM.PERM_PIN_TRAINING);
        const dag = await _parseDagJson(domainId, _dag);
        const pids = training.getPids(dag);
        assert(pids.length, new ValidationError('dag', null, 'Please specify at least one problem'));
        if (!tid) {
            tid = await training.add(domainId, title, content, this.user._id, dag, description, pin);
        } else {
            await training.edit(domainId, tid, {
                title, content, dag, description, pin,
            });
        }
        this.response.body = { tid };
        this.response.redirect = this.url('training_detail', { tid });
    }
}

export class TrainingFilesHandler extends Handler {
    tdoc: TrainingDoc;

    @param('tid', Types.ObjectId)
    async prepare(domainId: string, tid: ObjectId) {
        this.tdoc = await training.get(domainId, tid);
        if (!this.user.own(this.tdoc)) this.checkPerm(PERM.PERM_EDIT_TRAINING);
        else this.checkPerm(PERM.PERM_EDIT_TRAINING_SELF);
    }

    @param('tid', Types.ObjectId)
    async get(domainId: string, tid: ObjectId) {
        if (!this.user.own(this.tdoc)) this.checkPerm(PERM.PERM_EDIT_TRAINING);
        this.response.body = {
            tdoc: this.tdoc,
            tsdoc: await training.getStatus(domainId, this.tdoc.docId, this.user._id),
            udoc: await user.getById(domainId, this.tdoc.owner),
            files: sortFiles(this.tdoc.files || []),
            urlForFile: (filename: string) => this.url('training_file_download', { tid, filename }),
        };
        this.response.pjax = 'partials/files.html';
        this.response.template = 'training_files.html';
    }

    @param('tid', Types.ObjectId)
    @post('filename', Types.Filename, true)
    async postUploadFile(domainId: string, tid: ObjectId, filename: string) {
        if ((this.tdoc.files?.length || 0) >= system.get('limit.contest_files')) {
            throw new FileLimitExceededError('count');
        }
        const file = this.request.files?.file;
        if (!file) throw new ValidationError('file');
        const size = Math.sum((this.tdoc.files || []).map((i) => i.size)) + file.size;
        if (size >= system.get('limit.contest_files_size')) {
            throw new FileLimitExceededError('size');
        }
        await storage.put(`training/${domainId}/${tid}/${filename}`, file.filepath, this.user._id);
        const meta = await storage.getMeta(`training/${domainId}/${tid}/${filename}`);
        const payload = { _id: filename, name: filename, ...pick(meta, ['size', 'lastModified', 'etag']) };
        if (!meta) throw new FileUploadError();
        await training.edit(domainId, tid, { files: [...(this.tdoc.files || []), payload] });
        this.back();
    }

    @param('tid', Types.ObjectId)
    @post('files', Types.ArrayOf(Types.Filename))
    async postDeleteFiles(domainId: string, tid: ObjectId, files: string[]) {
        await Promise.all([
            storage.del(files.map((t) => `training/${domainId}/${tid}/${t}`), this.user._id),
            training.edit(domainId, tid, { files: this.tdoc.files.filter((i) => !files.includes(i.name)) }),
        ]);
        this.back();
    }
}
export class TrainingFileDownloadHandler extends Handler {
    @param('tid', Types.ObjectId)
    @param('filename', Types.Filename)
    @param('noDisposition', Types.Boolean)
    async get(domainId: string, tid: ObjectId, filename: string, noDisposition = false) {
        this.response.addHeader('Cache-Control', 'public');
        const target = `training/${domainId}/${tid}/${filename}`;
        const file = await storage.getMeta(target);
        await oplog.log(this, 'download.file.training', {
            target,
            size: file?.size || 0,
        });
        this.response.redirect = await storage.signDownloadLink(
            target, noDisposition ? undefined : filename, false, 'user',
        );
    }
}

export async function apply(ctx) {
    ctx.Route('training_main', '/training', TrainingMainHandler, PERM.PERM_VIEW_TRAINING);
    ctx.Route('training_create', '/training/create', TrainingEditHandler);
    ctx.Route('training_detail', '/training/:tid', TrainingDetailHandler, PERM.PERM_VIEW_TRAINING);
    ctx.Route('training_edit', '/training/:tid/edit', TrainingEditHandler);
    ctx.Route('training_files', '/training/:tid/file', TrainingFilesHandler, PERM.PERM_VIEW_TRAINING);
    ctx.Route('training_file_download', '/training/:tid/file/:filename', TrainingFileDownloadHandler, PERM.PERM_VIEW_TRAINING);
}
