import { FilterQuery, ObjectID } from 'mongodb';
import { parse } from 'path';
import {
    ContestNotAttendedError, ContestNotFoundError, PermissionError,
    ProblemNotFoundError, RecordNotFoundError, UserNotFoundError,
} from '../error';
import { RecordDoc, Tdoc } from '../interface';
import { PERM, PRIV, STATUS } from '../model/builtin';
import * as contest from '../model/contest';
import problem from '../model/problem';
import record from '../model/record';
import { langs } from '../model/setting';
import storage from '../model/storage';
import * as system from '../model/system';
import TaskModel from '../model/task';
import user from '../model/user';
import * as bus from '../service/bus';
import {
    Connection, ConnectionHandler, Handler, param, Route, Types,
} from '../service/server';
import { buildProjection } from '../utils';
import { postJudge } from './judge';

class RecordListHandler extends Handler {
    @param('page', Types.PositiveInt, true)
    @param('pid', Types.Name, true)
    @param('tid', Types.ObjectID, true)
    @param('uidOrName', Types.Name, true)
    @param('status', Types.Int, true)
    @param('fullStatus', Types.Boolean)
    @param('allDomain', Types.Boolean, true)
    async get(
        domainId: string, page = 1, pid?: string, tid?: ObjectID,
        uidOrName?: string, status?: number, full = false, all = false,
    ) {
        let tdoc = null;
        let invalid = false;
        this.response.template = 'record_main.html';
        const q: FilterQuery<RecordDoc> = { contest: tid };
        if (full) uidOrName = this.user._id.toString();
        if (tid) {
            tdoc = await contest.get(domainId, tid);
            if (!tdoc) throw new ContestNotFoundError(domainId, pid);
            if (!contest.canShowScoreboard.call(this, tdoc, true)) throw new PermissionError(PERM.PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD);
            if (!this.user.own(tdoc) && !(await contest.getStatus(domainId, tid, this.user._id))?.attend) {
                throw new ContestNotAttendedError(domainId, tid);
            }
        }
        if (uidOrName) {
            const udoc = await user.getById(domainId, +uidOrName)
                || await user.getByUname(domainId, uidOrName)
                || await user.getByEmail(domainId, uidOrName);
            if (udoc) q.uid = udoc._id;
            else invalid = true;
        }
        if (pid && tdoc && /^[A-Z]$/.test(pid)) {
            pid = tdoc.pids[parseInt(pid, 36) - 10];
        }
        if (pid) {
            const pdoc = await problem.get(domainId, pid);
            if (pdoc) q.pid = pdoc.docId;
            else invalid = true;
        }
        if (status) q.status = status;
        if (all) {
            this.checkPriv(PRIV.PRIV_MANAGE_ALL_DOMAIN);
            delete q.contest;
        }
        let cursor = record.getMulti(all ? '' : domainId, q).sort('_id', -1);
        if (!full) cursor = cursor.project(buildProjection(record.PROJECTION_LIST));
        const limit = full ? 10 : system.get('pagination.record');
        const rdocs = invalid
            ? [] as RecordDoc[]
            : await cursor.skip((page - 1) * limit).limit(limit).toArray();
        const canViewProblem = tid || this.user.hasPerm(PERM.PERM_VIEW_PROBLEM);
        const canViewHiddenProblem = this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN) || this.user._id;
        const [udict, pdict] = full ? [{}, {}]
            : await Promise.all([
                user.getList(domainId, rdocs.map((rdoc) => rdoc.uid)),
                canViewProblem
                    ? problem.getList(domainId, rdocs.map((rdoc) => rdoc.pid), canViewHiddenProblem, this.user.group, false)
                    : Object.fromEntries([rdocs.map((rdoc) => [rdoc.pid, { ...problem.default, pid: rdoc.pid }])]),
            ]);
        this.response.body = {
            page,
            rdocs,
            tdoc,
            pdict,
            udict,
            all,
            filterPid: pid,
            filterTid: tid,
            filterUidOrName: uidOrName,
            filterStatus: status,
        };
        if (this.user.hasPriv(PRIV.PRIV_VIEW_JUDGE_STATISTICS) && !full) {
            this.response.body.statistics = {
                ...await record.stat(all ? undefined : domainId),
                delay: await TaskModel.getDelay({ type: 'judge' }),
            };
        }
    }
}

class RecordDetailHandler extends Handler {
    @param('rid', Types.ObjectID)
    @param('download', Types.Boolean)
    async get(domainId: string, rid: ObjectID, download = false) {
        const rdoc = await record.get(domainId, rid);
        if (!rdoc) throw new RecordNotFoundError(rid);
        let tdoc;
        if (rdoc.contest?.toHexString() === '000000000000000000000000') {
            if (rdoc.uid !== this.user._id) throw new PermissionError(PERM.PERM_READ_RECORD_CODE);
        } else if (rdoc.contest) {
            tdoc = await contest.get(domainId, rdoc.contest);
            let canView = this.user.own(tdoc);
            canView ||= contest.canShowRecord.call(this, tdoc);
            canView ||= contest.canShowSelfRecord.call(this, tdoc, true) && rdoc.uid === this.user._id;
            if (!canView) throw new PermissionError(rid);
        }

        // eslint-disable-next-line prefer-const
        let [pdoc, self, udoc] = await Promise.all([
            problem.get(rdoc.domainId, rdoc.pid),
            problem.getStatus(domainId, rdoc.pid, this.user._id),
            user.getById(domainId, rdoc.uid),
        ]);

        let canViewCode = rdoc.uid === this.user._id;
        canViewCode ||= this.user.hasPriv(PRIV.PRIV_READ_RECORD_CODE);
        canViewCode ||= this.user.hasPerm(PERM.PERM_READ_RECORD_CODE);
        canViewCode ||= this.user.hasPerm(PERM.PERM_READ_RECORD_CODE_ACCEPT) && self?.status === STATUS.STATUS_ACCEPTED;
        if (!canViewCode) {
            rdoc.code = '';
            rdoc.compilerTexts = [];
        }

        if (download && rdoc.code.startsWith('@@hydro_submission_file@@')) {
            const [id, filename] = rdoc.code.split('@@hydro_submission_file@@')[1].split('#');
            this.response.redirect = await storage.signDownloadLink(`submission/${id}`, filename || 'code', true, 'judge');
            return;
        }
        if (download) {
            const lang = langs[rdoc.lang]?.pretest || rdoc.lang;
            this.response.body = rdoc.code;
            this.response.type = 'text/plain';
            this.response.disposition = `attachment; filename="${langs[lang].code_file || `foo.${rdoc.lang}`}"`;
            return;
        }
        if (pdoc && !(rdoc.contest && this.user._id === rdoc.uid)) {
            if (!problem.canViewBy(pdoc, this.user)) throw new PermissionError(PERM.PERM_VIEW_PROBLEM_HIDDEN);
        }
        let subtaskSum = 0;
        for (const rcdoc of rdoc.testCases) {
            if (rcdoc.message.startsWith('Subtask', 0)) {
                subtaskSum = Math.max(subtaskSum, parseInt(rcdoc.message.slice(8, rcdoc.message.indexOf('.'))) || 0);
            }
        }
        this.response.template = 'record_detail.html';
        this.response.body = {
            udoc, rdoc, pdoc, tdoc, subtaskSum
        };
    }

    @param('rid', Types.ObjectID)
    async postRejudge(domainId: string, rid: ObjectID) {
        this.checkPerm(PERM.PERM_REJUDGE);
        const priority = await record.submissionPriority(this.user._id, -20);
        const rdoc = await record.get(domainId, rid);
        if (rdoc) {
            const isContest = rdoc.contest && rdoc.contest.toHexString() !== '000000000000000000000000';
            await record.reset(domainId, rid, true);
            await record.judge(domainId, rid, priority, isContest ? { detail: false } : {});
        }
        this.back();
    }

    @param('rid', Types.ObjectID)
    async postCancel(domainId: string, rid: ObjectID) {
        const rdoc = await record.get(domainId, rid);
        if (rdoc) {
            const $set = {
                status: STATUS.STATUS_CANCELED,
                score: 0,
                time: 0,
                memory: 0,
                testCases: [{
                    status: 9, score: 0, time: 0, memory: 0, message: 'score canceled',
                }],
            };
            const [latest] = await Promise.all([
                record.update(domainId, rid, $set),
                TaskModel.deleteMany({ rid: rdoc._id }),
            ]);
            if (latest) await postJudge(latest);
        }
        this.back();
    }
}

class RecordMainConnectionHandler extends ConnectionHandler {
    cleanup: bus.Disposable = () => { };
    all = false;
    tid: string;
    uid: number;
    pid: number;
    status: number;
    pretest = false;
    tdoc: Tdoc<30>;

    @param('tid', Types.ObjectID, true)
    @param('pid', Types.Name, true)
    @param('uidOrName', Types.Name, true)
    @param('status', Types.Int, true)
    @param('pretest', Types.Boolean)
    @param('allDomain', Types.Boolean)
    async prepare(
        domainId: string, tid?: ObjectID, pid?: string, uidOrName?: string,
        status?: number, pretest = false, all = false,
    ) {
        if (tid) {
            this.tdoc = await contest.get(domainId, tid);
            if (!this.tdoc) throw new ContestNotFoundError(domainId, tid);
            if (pretest || contest.canShowScoreboard.call(this, this.tdoc, true)) this.tid = tid.toHexString();
            else throw new PermissionError(PERM.PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD);
        }
        if (pretest) {
            this.pretest = true;
            this.uid = this.user._id;
        } else if (uidOrName) {
            let udoc = await user.getById(domainId, +uidOrName);
            if (udoc) this.uid = udoc._id;
            else {
                udoc = await user.getByUname(domainId, uidOrName);
                if (udoc) this.uid = udoc._id;
                else throw new UserNotFoundError(uidOrName);
            }
        }
        if (pid) {
            const pdoc = await problem.get(domainId, pid);
            if (pdoc) this.pid = pdoc.docId;
            else throw new ProblemNotFoundError(domainId, pid);
        }
        if (status) this.status = status;
        if (all) {
            this.checkPriv(PRIV.PRIV_MANAGE_ALL_DOMAIN);
            this.all = true;
        }
        this.cleanup = bus.on('record/change', this.onRecordChange.bind(this));
    }

    async message(msg: { rids: string[] }) {
        if (!(msg.rids instanceof Array)) return;
        const rids = msg.rids.map((id) => new ObjectID(id));
        const rdocs = await record.getMulti(this.domainId, { _id: { $in: rids } }).project(buildProjection(record.PROJECTION_LIST)).toArray();
        for (const rdoc of rdocs) this.onRecordChange(rdoc);
    }

    async onRecordChange(rdoc: RecordDoc) {
        if (!this.all) {
            if (!this.pretest && rdoc.input) return;
            if (rdoc.domainId !== this.domainId) return;
            if (rdoc.contest && ![this.tid, '000000000000000000000000'].includes(rdoc.contest.toString())) return;
            if (this.tid && contest.isLocked(this.tdoc)) return;
            if (this.tid && !contest.canShowSelfRecord.call(this, this.tdoc, true)) return;
        }
        if (this.pid && rdoc.pid !== this.pid) return;
        if (this.uid && rdoc.uid !== this.uid) return;

        // eslint-disable-next-line prefer-const
        let [udoc, pdoc] = await Promise.all([
            user.getById(this.domainId, rdoc.uid),
            problem.get(rdoc.domainId, rdoc.pid),
        ]);
        const tdoc = this.tid ? this.tdoc || await contest.get(rdoc.domainId, new ObjectID(this.tid)) : null;
        if (pdoc && !rdoc.contest) {
            if (!problem.canViewBy(pdoc, this.user)) pdoc = null;
            if (!this.user.hasPerm(PERM.PERM_VIEW_PROBLEM)) pdoc = null;
        }
        if (this.pretest) this.send({ rdoc });
        else {
            this.send({
                html: await this.renderHTML('record_main_tr.html', {
                    rdoc, udoc, pdoc, tdoc, all: this.all,
                }),
            });
        }
    }
}

class RecordDetailConnectionHandler extends ConnectionHandler {
    cleanup: bus.Disposable = () => { };
    rid: string = '';
    disconnectTimeout: NodeJS.Timeout;
    subtaskSum: number = 0;

    @param('rid', Types.ObjectID)
    async prepare(domainId: string, rid: ObjectID) {
        const rdoc = await record.get(domainId, rid);
        if (!rdoc) return;
        if (rdoc.contest && rdoc.input === undefined) {
            const tdoc = await contest.get(domainId, rdoc.contest);
            let canView = this.user.own(tdoc);
            canView ||= contest.canShowRecord.call(this, tdoc);
            canView ||= this.user._id === rdoc.uid && contest.canShowSelfRecord.call(this, tdoc);
            if (!canView) throw new PermissionError(PERM.PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD);
        }
        const [pdoc, self] = await Promise.all([
            problem.get(rdoc.domainId, rdoc.pid),
            problem.getStatus(domainId, rdoc.pid, this.user._id),
        ]);
        for (const rcdoc of rdoc.testCases)
            if (rcdoc.message.startsWith('Subtask'))
                this.subtaskSum = Math.max(this.subtaskSum, parseInt(rcdoc.message.slice(8, rcdoc.message.indexOf('.'))) || 0);
        let canViewCode = rdoc.uid === this.user._id;
        canViewCode ||= this.user.hasPriv(PRIV.PRIV_READ_RECORD_CODE);
        canViewCode ||= this.user.hasPerm(PERM.PERM_READ_RECORD_CODE);
        canViewCode ||= this.user.hasPerm(PERM.PERM_READ_RECORD_CODE_ACCEPT) && self?.status === STATUS.STATUS_ACCEPTED;
        if (!canViewCode) {
            rdoc.code = '';
            rdoc.compilerTexts = [];
        }

        if (!(rdoc.contest && this.user._id === rdoc.uid)) {
            if (!problem.canViewBy(pdoc, this.user)) throw new PermissionError(PERM.PERM_VIEW_PROBLEM_HIDDEN);
        }

        this.rid = rid.toString();
        this.cleanup = bus.on('record/change', this.onRecordChange.bind(this));
        this.onRecordChange(rdoc);
    }

    // eslint-disable-next-line
    async onRecordChange(rdoc: RecordDoc, $set?: any, $push?: any) {
        if (rdoc._id.toString() !== this.rid) return;
        if (this.disconnectTimeout) {
            clearTimeout(this.disconnectTimeout);
            this.disconnectTimeout = null;
        }
        const subtaskSum = this.subtaskSum;
        // TODO: frontend doesn't support incremental update
        // if ($set) this.send({ $set, $push });
        this.send({
            status_html: subtaskSum === 0
                ? await this.renderHTML('record_detail_status.html', { rdoc })
                : await this.renderHTML('record_detail_status_subtask.html', { rdoc, subtaskSum }),
            summary_html: await this.renderHTML('record_detail_summary.html', { rdoc }),
        });
        if (![STATUS.STATUS_WAITING, STATUS.STATUS_JUDGING, STATUS.STATUS_COMPILING, STATUS.STATUS_FETCHED].includes(rdoc.status)) {
            this.disconnectTimeout = setTimeout(() => this.close(4001, 'Ended'), 10000);
        }
    }
}

export async function apply() {
    Route('record_main', '/record', RecordListHandler);
    Route('record_detail', '/record/:rid', RecordDetailHandler);
    Connection('record_conn', '/record-conn', RecordMainConnectionHandler);
    Connection('record_detail_conn', '/record-detail-conn', RecordDetailConnectionHandler);
}

global.Hydro.handler.record = apply;
