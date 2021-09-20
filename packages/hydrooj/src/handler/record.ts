import { pick } from 'lodash';
import { FilterQuery, ObjectID } from 'mongodb';
import {
    ContestNotAttendedError, ContestNotFoundError, PermissionError,
    ProblemNotFoundError, RecordNotFoundError, UserNotFoundError,
} from '../error';
import { RecordDoc } from '../interface';
import { PERM, PRIV, STATUS } from '../model/builtin';
import * as contest from '../model/contest';
import problem from '../model/problem';
import record from '../model/record';
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
        const q: FilterQuery<RecordDoc> = { 'contest.tid': tid, hidden: false };
        if (full) uidOrName = this.user._id.toString();
        if (tid) {
            tdoc = await contest.get(domainId, tid, -1);
            if (!tdoc) throw new ContestNotFoundError(domainId, pid);
            if (!contest.canShowScoreboard.call(this, tdoc, true)) throw new PermissionError(PERM.PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD);
            if (!this.user.own(tdoc) && !(await contest.getStatus(domainId, tid, this.user._id, -1))?.attend) {
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
        }
        let cursor = record.getMulti(all ? '' : domainId, q).sort('_id', -1);
        if (!full) cursor = cursor.project(buildProjection(record.PROJECTION_LIST));
        const limit = full ? 10 : system.get('pagination.record');
        const rdocs = invalid
            ? [] as RecordDoc[]
            : await cursor.skip((page - 1) * limit).limit(limit).toArray();
        const canViewProblem = this.user.hasPerm(PERM.PERM_VIEW_PROBLEM);
        const canViewProblemHidden = (!!tid) || this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN);
        const [udict, pdict] = full ? [{}, {}]
            : await Promise.all([
                user.getList(domainId, rdocs.map((rdoc) => rdoc.uid)),
                canViewProblem
                    ? problem.getList(domainId, rdocs.map(
                        (rdoc) => (rdoc.domainId === domainId ? rdoc.pid : `${rdoc.pdomain}:${rdoc.pid}`),
                    ), canViewProblemHidden || this.user._id, false)
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
    async get(domainId: string, rid: ObjectID) {
        this.response.template = 'record_detail.html';
        const rdoc = await record.get(domainId, rid);
        if (!rdoc) throw new RecordNotFoundError(rid);
        if (rdoc.contest) {
            const tdoc = await contest.get(domainId, rdoc.contest.tid, rdoc.contest.type);
            let canView = this.user.own(tdoc);
            canView ||= contest.canShowRecord.call(this, tdoc);
            canView ||= contest.canShowSelfRecord.call(this, tdoc, true) && rdoc.uid === this.user._id;
            if (!canView) throw new PermissionError(rid);
        }
        if (rdoc.uid !== this.user._id && !this.user.hasPriv(PRIV.PRIV_READ_RECORD_CODE)) {
            if (!this.user.hasPerm(PERM.PERM_READ_RECORD_CODE)) {
                rdoc.code = '';
                rdoc.compilerTexts = [];
            }
        }
        // eslint-disable-next-line prefer-const
        let [pdoc, udoc] = await Promise.all([
            problem.get(rdoc.pdomain, rdoc.pid),
            user.getById(domainId, rdoc.uid),
        ]);
        if (
            !pdoc
            || !this.user.hasPerm(PERM.PERM_VIEW_PROBLEM)
            || (!rdoc.contest && pdoc.hidden && !this.user.own(pdoc) && !this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN))
        ) {
            if (this.user._id !== rdoc.uid) throw new PermissionError(PERM.PERM_READ_RECORD_CODE);
            else pdoc = { ...problem.default, ...pdoc ? pick(pdoc, ['domainId', 'docId', 'pid']) : {} };
        }
        this.response.body = { udoc, rdoc, pdoc };
        if (rdoc.contest) {
            this.response.body.tdoc = await contest.get(domainId, rdoc.contest.tid, rdoc.contest.type);
        }
    }

    @param('rid', Types.ObjectID)
    async postRejudge(domainId: string, rid: ObjectID) {
        this.checkPerm(PERM.PERM_REJUDGE);
        const rdoc = await record.get(domainId, rid);
        if (rdoc) {
            await record.reset(domainId, rid, true);
            await record.judge(domainId, rid, -10);
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
    pdomain: string;
    pid: number;
    status: number;
    pretest = false;

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
            const tdoc = await contest.get(domainId, tid, -1);
            if (!tdoc) throw new ContestNotFoundError(domainId, tid);
            if (pretest || contest.canShowScoreboard.call(this, tdoc, true)) this.tid = tid.toHexString();
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
            const pdomain = pid.includes(':') ? pid.split(':')[0] : domainId;
            const ppid = pid.includes(':') ? +pid.split(':')[1] : pid;
            const pdoc = await problem.get(pdomain, ppid);
            if (pdoc) {
                this.pdomain = pdoc.domainId;
                this.pid = pdoc.docId;
            } else throw new ProblemNotFoundError(domainId, pid);
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
        if (!this.all && !this.pretest && rdoc.input) return;
        if (!this.all && rdoc.domainId !== this.domainId) return;
        if (!this.all && rdoc.contest && rdoc.contest.tid.toString() !== this.tid) return;
        if (!this.all && this.pid && rdoc.pid !== this.pid) return;
        if (this.uid && rdoc.uid !== this.uid) return;

        // eslint-disable-next-line prefer-const
        let [udoc, pdoc] = await Promise.all([
            user.getById(this.domainId, rdoc.uid),
            problem.get(rdoc.pdomain, rdoc.pid),
        ]);
        const tdoc = this.tid ? await contest.get(rdoc.domainId, new ObjectID(this.tid), -1) : null;
        if (pdoc && !rdoc.contest) {
            if (pdoc.hidden && !this.user.own(pdoc) && !this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN)) pdoc = null;
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

    @param('rid', Types.ObjectID)
    async prepare(domainId: string, rid: ObjectID) {
        const rdoc = await record.get(domainId, rid);
        if (!rdoc) return;
        if (rdoc.contest && rdoc.input === undefined) {
            const tdoc = await contest.get(domainId, rdoc.contest.tid, -1);
            let canView = this.user.own(tdoc);
            canView ||= contest.canShowRecord.call(this, tdoc);
            canView ||= this.user._id === rdoc.uid && contest.canShowSelfRecord.call(this, tdoc);
            if (!canView) throw new PermissionError(PERM.PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD);
        }
        if (rdoc.uid !== this.user._id && !this.user.hasPriv(PRIV.PRIV_READ_RECORD_CODE)) {
            if (!this.user.hasPerm(PERM.PERM_READ_RECORD_CODE)) {
                rdoc.code = '';
                rdoc.compilerTexts = [];
            }
        }
        const pdoc = await problem.get(rdoc.pdomain, rdoc.pid);
        let canView = pdoc && this.user.own(pdoc);
        canView ||= !pdoc?.hidden && this.user.hasPerm(PERM.PERM_VIEW_PROBLEM);
        canView ||= this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN);
        canView ||= !!rdoc.contest || this.user._id === rdoc.uid;
        if (!canView) throw new PermissionError(PERM.PERM_READ_RECORD_CODE);
        this.rid = rid.toString();
        this.cleanup = bus.on('record/change', this.onRecordChange.bind(this));
        this.onRecordChange(rdoc);
    }

    // eslint-disable-next-line
    async onRecordChange(rdoc: RecordDoc, $set?: any, $push?: any) {
        if (rdoc._id.toString() !== this.rid) return;
        // TODO: frontend doesn't support incremental update
        // if ($set) this.send({ $set, $push });
        this.send({
            status_html: await this.renderHTML('record_detail_status.html', { rdoc }),
            summary_html: await this.renderHTML('record_detail_summary.html', { rdoc }),
        });
    }
}

export async function apply() {
    Route('record_main', '/record', RecordListHandler);
    Route('record_detail', '/record/:rid', RecordDetailHandler);
    Connection('record_conn', '/record-conn', RecordMainConnectionHandler);
    Connection('record_detail_conn', '/record-detail-conn', RecordDetailConnectionHandler);
}

global.Hydro.handler.record = apply;
