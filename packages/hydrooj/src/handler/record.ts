import { FilterQuery, ObjectID } from 'mongodb';
import { postJudge } from './judge';
import {
    ContestNotFoundError, PermissionError, ProblemNotFoundError,
    RecordNotFoundError, UserNotFoundError,
} from '../error';
import { buildProjection } from '../utils';
import { RecordDoc } from '../interface';
import { PERM, STATUS, PRIV } from '../model/builtin';
import * as system from '../model/system';
import problem from '../model/problem';
import record from '../model/record';
import * as contest from '../model/contest';
import user from '../model/user';
import TaskModel from '../model/task';
import paginate from '../lib/paginate';
import * as bus from '../service/bus';
import {
    Route, Handler, Connection, ConnectionHandler, Types, param,
} from '../service/server';

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
        this.response.template = 'record_main.html';
        const q: FilterQuery<RecordDoc> = { 'contest.tid': tid, hidden: false };
        if (full) uidOrName = this.user._id.toString();
        if (tid) {
            const tdoc = await contest.get(domainId, tid, -1);
            if (!tdoc) throw new ContestNotFoundError(domainId, pid);
            if (!contest.canShowScoreboard.call(this, tdoc, true)) throw new PermissionError(PERM.PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD);
        }
        if (uidOrName) {
            let udoc = await user.getById(domainId, +uidOrName);
            if (udoc) q.uid = udoc._id;
            else {
                udoc = await user.getByUname(domainId, uidOrName);
                if (udoc) q.uid = udoc._id;
                else q.uid = null;
            }
        }
        if (pid) {
            const pdoc = await problem.get(domainId, pid);
            if (pdoc) q.pid = pdoc.docId;
            else q.pid = null;
        }
        if (status) q.status = status;
        let cursor = record.getMulti(domainId, q).sort('_id', -1);
        if (!full) cursor = cursor.project(buildProjection(record.PROJECTION_LIST));
        const [rdocs] = await paginate(cursor, page, full ? 10 : system.get('pagination.record'));
        const canViewProblem = this.user.hasPerm(PERM.PERM_VIEW_PROBLEM);
        const canViewProblemHidden = this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN);
        const [udict, pdict] = full ? [{}, {}]
            : await Promise.all([
                user.getList(domainId, rdocs.map((rdoc) => rdoc.uid)),
                canViewProblem
                    ? problem.getList(domainId, rdocs.map(
                        (rdoc) => (rdoc.domainId === domainId ? rdoc.pid : `${rdoc.pdomain}:${rdoc.pid}`),
                    ), canViewProblemHidden, false)
                    : Object.fromEntries([rdocs.map((rdoc) => [rdoc.pid, { ...problem.default, pid: rdoc.pid }])]),
            ]);
        this.response.body = {
            page,
            rdocs,
            pdict,
            udict,
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
            if (!contest.canShowRecord.call(this, tdoc, true)) throw new PermissionError(rid);
        }
        if (rdoc.uid !== this.user._id && !this.user.hasPriv(PRIV.PRIV_READ_RECORD_CODE)) {
            if (!this.user.hasPerm(PERM.PERM_READ_RECORD_CODE)) rdoc.code = null;
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
            pdoc = { ...problem.default, docId: pdoc?.docId || 0, pid: '*' };
        }
        this.response.body = {
            path: [
                ['Hydro', 'homepage'],
                ['record_detail', null],
            ],
            udoc,
            rdoc,
            pdoc,
        };
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
            await record.judge(domainId, rid, 0);
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
                bus.emit('record/change', rdoc, $set),
            ]);
            await postJudge(latest);
        }
        this.back();
    }
}

class RecordMainConnectionHandler extends ConnectionHandler {
    dispose: bus.Disposable;
    tid: string;
    uid: number;
    pdomain: string;
    pid: number;
    status: number;
    pretest: boolean;

    @param('tid', Types.ObjectID, true)
    @param('pid', Types.Name, true)
    @param('uidOrName', Types.Name, true)
    @param('status', Types.Int, true)
    @param('pretest', Types.Boolean)
    async prepare(domainId: string, tid?: ObjectID, pid?: string, uidOrName?: string, status?: number, pretest = false) {
        if (tid) {
            const tdoc = await contest.get(domainId, tid, -1);
            if (!tdoc) throw new ContestNotFoundError(domainId, tid);
            if (contest.canShowScoreboard.call(this, tdoc, true)) this.tid = tid.toHexString();
            else throw new PermissionError(PERM.PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD);
        }
        if (uidOrName) {
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
        if (pretest) this.pretest = true;
        this.dispose = bus.on('record/change', this.onRecordChange.bind(this));
    }

    async message(msg) {
        if (msg.rids instanceof Array) {
            const rids = msg.rids.map((id: string) => new ObjectID(id));
            const rdocs = await record.getMulti(this.domainId, { _id: { $in: rids } }).toArray();
            for (const rdoc of rdocs) this.onRecordChange(rdoc);
        }
    }

    async cleanup() {
        if (this.dispose) this.dispose();
    }

    async onRecordChange(rdoc: RecordDoc) {
        if (rdoc.domainId !== this.domainId) return;
        if (!this.pretest && rdoc.input) return;
        if (!this.pretest && rdoc.contest && rdoc.contest.tid.toString() !== this.tid) return;
        if (this.uid && rdoc.uid !== this.uid) return;
        if (this.pid && (rdoc.pid !== this.pid || rdoc.pdomain !== this.pdomain)) return;
        // eslint-disable-next-line prefer-const
        let [udoc, pdoc] = await Promise.all([
            user.getById(this.domainId, rdoc.uid),
            problem.get(this.domainId, rdoc.pid, null),
        ]);
        if (pdoc) {
            if (pdoc.hidden && !this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN)) pdoc = null;
            if (!this.user.hasPerm(PERM.PERM_VIEW_PROBLEM)) pdoc = null;
        }
        if (this.pretest) this.send({ rdoc });
        else this.send({ html: await this.renderHTML('record_main_tr.html', { rdoc, udoc, pdoc }) });
    }
}

class RecordDetailConnectionHandler extends ConnectionHandler {
    dispose: bus.Disposable;
    rid: string;

    @param('rid', Types.ObjectID)
    async prepare(domainId: string, rid: ObjectID) {
        const rdoc = await record.get(domainId, rid);
        if (rdoc.contest && rdoc.input === undefined) {
            const tdoc = await contest.get(domainId, rdoc.contest.tid, -1);
            if (!contest.canShowRecord.call(this, tdoc)) throw new PermissionError(PERM.PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD);
        }
        this.rid = rid.toString();
        this.dispose = bus.on('record/change', this.onRecordChange.bind(this));
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

    async cleanup() {
        if (this.dispose) this.dispose();
    }
}

export async function apply() {
    Route('record_main', '/record', RecordListHandler);
    Route('record_detail', '/record/:rid', RecordDetailHandler);
    Connection('record_conn', '/record-conn', RecordMainConnectionHandler);
    Connection('record_detail_conn', '/record-detail-conn', RecordDetailConnectionHandler);
}

global.Hydro.handler.record = apply;
