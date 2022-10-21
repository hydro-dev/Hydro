import { omit, throttle } from 'lodash';
import { FilterQuery, ObjectID } from 'mongodb';
import {
    ContestNotAttendedError, ContestNotFoundError, ForbiddenError, PermissionError,
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
import { ConnectionHandler, param, Types } from '../service/server';
import { buildProjection } from '../utils';
import { ContestDetailBaseHandler } from './contest';
import { postJudge } from './judge';

class RecordListHandler extends ContestDetailBaseHandler {
    tdoc?: Tdoc<30>;

    @param('page', Types.PositiveInt, true)
    @param('pid', Types.Name, true)
    @param('tid', Types.ObjectID, true)
    @param('uidOrName', Types.Name, true)
    @param('lang', Types.String, true)
    @param('status', Types.Int, true)
    @param('fullStatus', Types.Boolean)
    @param('allDomain', Types.Boolean, true)
    async get(
        domainId: string, page = 1, pid?: string, tid?: ObjectID,
        uidOrName?: string, lang?: string, status?: number, full = false,
        all = false,
    ) {
        let tdoc = null;
        let invalid = false;
        this.response.template = 'record_main.html';
        const q: FilterQuery<RecordDoc> = { contest: tid };
        if (full) uidOrName = this.user._id.toString();
        if (tid) {
            tdoc = await contest.get(domainId, tid);
            this.tdoc = tdoc;
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
        if (lang) q.lang = lang;
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
            filterLang: lang,
            filterStatus: status,
        };
        if (this.user.hasPriv(PRIV.PRIV_VIEW_JUDGE_STATISTICS) && !full) {
            this.response.body.statistics = await record.stat(all ? undefined : domainId);
        }
    }
}

class RecordDetailHandler extends ContestDetailBaseHandler {
    rdoc: RecordDoc;
    tdoc?: Tdoc<30>;

    @param('rid', Types.ObjectID)
    async prepare(domainId: string, rid: ObjectID) {
        this.rdoc = await record.get(domainId, rid);
        if (!this.rdoc) throw new RecordNotFoundError(rid);
    }

    async download() {
        for (const file of ['code', 'hack']) {
            if (!this.rdoc.files?.[file]) continue;
            const [id, filename] = this.rdoc.files?.[file]?.split('#') || [];
            // eslint-disable-next-line no-await-in-loop
            this.response.redirect = await storage.signDownloadLink(`submission/${id}`, filename || file, true, 'user');
            return;
        }
        const lang = langs[this.rdoc.lang]?.pretest || this.rdoc.lang;
        this.response.body = this.rdoc.code;
        this.response.type = 'text/plain';
        this.response.disposition = `attachment; filename="${langs[lang].code_file || `foo.${this.rdoc.lang}`}"`;
    }

    @param('rid', Types.ObjectID)
    @param('download', Types.Boolean)
    // eslint-disable-next-line consistent-return
    async get(domainId: string, rid: ObjectID, download = false) {
        const rdoc = this.rdoc;
        let contestSelfCode = false;
        if (rdoc.contest?.toString() === '000000000000000000000000') {
            if (rdoc.uid !== this.user._id) throw new PermissionError(PERM.PERM_READ_RECORD_CODE);
        } else if (rdoc.contest) {
            this.tdoc = await contest.get(domainId, rdoc.contest);
            let canView = this.user.own(this.tdoc);
            canView ||= contest.canShowRecord.call(this, this.tdoc);
            canView ||= contest.canShowSelfRecord.call(this, this.tdoc, true) && rdoc.uid === this.user._id;
            if (!canView)  {
                if (rdoc.uid !== this.user._id) {
                    throw new PermissionError(rid);
                } else {
                    contestSelfCode = true;
                }    
            }
            this.args.tid = this.tdoc.docId;
        }

        // eslint-disable-next-line prefer-const
        let [pdoc, self, udoc] = await Promise.all([
            problem.get(rdoc.domainId, rdoc.pid),
            problem.getStatus(domainId, rdoc.pid, this.user._id),
            user.getById(domainId, rdoc.uid),
        ]);

        if (contestSelfCode) {
            rdoc.status = STATUS.STATUS_WAITING;
            rdoc.score = 0;
            rdoc.judgeTexts = [];
            rdoc.testCases = [];
        }

        let canViewCode = rdoc.uid === this.user._id;
        canViewCode ||= this.user.hasPriv(PRIV.PRIV_READ_RECORD_CODE);
        canViewCode ||= this.user.hasPerm(PERM.PERM_READ_RECORD_CODE);
        canViewCode ||= this.user.hasPerm(PERM.PERM_READ_RECORD_CODE_ACCEPT) && self?.status === STATUS.STATUS_ACCEPTED;
        if (this.tdoc && this.tdoc.allowViewCode && contest.isDone(this.tdoc)) {
            const tsdoc = await contest.getStatus(domainId, this.tdoc.docId, this.user._id);
            canViewCode ||= tsdoc?.attend;
        }

        if (!canViewCode) {
            rdoc.code = '';
            rdoc.files = {};
            rdoc.compilerTexts = [];
        } else if (download) return await this.download();
        if (pdoc && !(rdoc.contest && this.user._id === rdoc.uid)) {
            if (!problem.canViewBy(pdoc, this.user)) {
                throw new PermissionError(PERM.PERM_VIEW_PROBLEM_HIDDEN);
            } 
        }

        if (contestSelfCode) {
            rdoc.status = STATUS.STATUS_WAITING;
            rdoc.score = 0;
            rdoc.judgeTexts = [];
            rdoc.testCases = [];
        }

        this.response.template = 'record_detail.html';
        this.response.body = {
            udoc, rdoc, pdoc, tdoc: this.tdoc,
        };
    }

    @param('rid', Types.ObjectID)
    async post() {
        this.checkPerm(PERM.PERM_REJUDGE);
        if (this.rdoc.files?.hack) throw new ForbiddenError('Cannot rejudge a hack record.');
    }

    @param('rid', Types.ObjectID)
    async postRejudge(domainId: string, rid: ObjectID) {
        const priority = await record.submissionPriority(this.user._id, -20);
        const isContest = this.rdoc.contest && this.rdoc.contest.toString() !== '000000000000000000000000';
        await record.reset(domainId, rid, true);
        await record.judge(domainId, rid, priority, isContest ? { detail: false } : {});
        this.back();
    }

    @param('rid', Types.ObjectID)
    async postCancel(domainId: string, rid: ObjectID) {
        const $set = {
            status: STATUS.STATUS_CANCELED,
            score: 0,
            time: 0,
            memory: 0,
            testCases: [{
                id: 0, subtaskId: 0, status: 9, score: 0, time: 0, memory: 0, message: 'score canceled',
            }],
        };
        const [latest] = await Promise.all([
            record.update(domainId, rid, $set),
            TaskModel.deleteMany({ rid: this.rdoc._id }),
        ]);
        if (latest) await postJudge(latest);
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
        const rdocs = await record.getMulti(this.args.domainId, { _id: { $in: rids } }).project(buildProjection(record.PROJECTION_LIST)).toArray();
        for (const rdoc of rdocs) this.onRecordChange(rdoc);
    }

    async onRecordChange(rdoc: RecordDoc) {
        if (!this.all) {
            if (!this.pretest && rdoc.input) return;
            if (rdoc.domainId !== this.args.domainId) return;
            if (rdoc.contest && ![this.tid, '000000000000000000000000'].includes(rdoc.contest.toString())) return;
            if (this.tid && contest.isLocked(this.tdoc)) return;
            if (this.tid && !contest.canShowSelfRecord.call(this, this.tdoc, true)) return;
        }
        if (this.pid && rdoc.pid !== this.pid) return;
        if (this.uid && rdoc.uid !== this.uid) return;

        // eslint-disable-next-line prefer-const
        let [udoc, pdoc] = await Promise.all([
            user.getById(this.args.domainId, rdoc.uid),
            problem.get(rdoc.domainId, rdoc.pid),
        ]);
        const tdoc = this.tid ? this.tdoc || await contest.get(rdoc.domainId, new ObjectID(this.tid)) : null;
        if (pdoc && !rdoc.contest) {
            if (!problem.canViewBy(pdoc, this.user)) pdoc = null;
            if (!this.user.hasPerm(PERM.PERM_VIEW_PROBLEM)) pdoc = null;
        }
        if (this.pretest) this.send({ rdoc: omit(rdoc, ['code', 'input']) });
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
    throttleSend: any;

    @param('rid', Types.ObjectID)
    async prepare(domainId: string, rid: ObjectID) {
        let viewSelfCode = false;
        const rdoc = await record.get(domainId, rid);
        if (!rdoc) return;
        if (rdoc.contest && rdoc.input === undefined) {
            const tdoc = await contest.get(domainId, rdoc.contest);
            let canView = this.user.own(tdoc);
            canView ||= contest.canShowRecord.call(this, tdoc);
            canView ||= this.user._id === rdoc.uid && contest.canShowSelfRecord.call(this, tdoc);
            if (!canView && this.user._id !== rdoc.uid) throw new PermissionError(PERM.PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD);
            if (!canView && this.user._id === rdoc.uid) viewSelfCode = true;
        }
        const [pdoc, self] = await Promise.all([
            problem.get(rdoc.domainId, rdoc.pid),
            problem.getStatus(domainId, rdoc.pid, this.user._id),
        ]);

        if (viewSelfCode) {
            rdoc.status = STATUS.STATUS_WAITING;
            rdoc.score = 0;
            rdoc.judgeTexts = [];
            rdoc.testCases = [];
        }

        let canViewCode = rdoc.uid === this.user._id;
        canViewCode ||= this.user.hasPriv(PRIV.PRIV_READ_RECORD_CODE);
        canViewCode ||= this.user.hasPerm(PERM.PERM_READ_RECORD_CODE_ACCEPT) && self?.status === STATUS.STATUS_ACCEPTED;
        if (!canViewCode) {
            rdoc.code = '';
            rdoc.compilerTexts = [];
        }
        
        if (!(rdoc.contest && this.user._id === rdoc.uid)) {
            if (!problem.canViewBy(pdoc, this.user)) throw new PermissionError(PERM.PERM_VIEW_PROBLEM_HIDDEN);
        }

        this.throttleSend = throttle(this.send, 1000);
        this.rid = rid.toString();
        this.cleanup = bus.on('record/change', this.onRecordChange.bind(this));
        
        this.onRecordChange(rdoc);
    }

    async sendUpdate(rdoc: RecordDoc) {
        this.send({
            status_html: await this.renderHTML('record_detail_status.html', { rdoc }),
            summary_html: await this.renderHTML('record_detail_summary.html', { rdoc }),
        });
    }

    // eslint-disable-next-line
    async onRecordChange(rdoc: RecordDoc, $set?: any, $push?: any) {
        if (rdoc._id.toString() !== this.rid) return;
        if (this.disconnectTimeout) {
            clearTimeout(this.disconnectTimeout);
            this.disconnectTimeout = null;
        }
        // TODO: frontend doesn't support incremental update
        // if ($set) this.send({ $set, $push });
        if (![STATUS.STATUS_WAITING, STATUS.STATUS_JUDGING, STATUS.STATUS_COMPILING, STATUS.STATUS_FETCHED].includes(rdoc.status)) {
            this.sendUpdate(rdoc);
            this.disconnectTimeout = setTimeout(() => this.close(4001, 'Ended'), 30000);
        } else this.throttleSend(rdoc);
    }
}

export async function apply(ctx) {
    ctx.Route('record_main', '/record', RecordListHandler);
    ctx.Route('record_detail', '/record/:rid', RecordDetailHandler);
    ctx.Connection('record_conn', '/record-conn', RecordMainConnectionHandler);
    ctx.Connection('record_detail_conn', '/record-detail-conn', RecordDetailConnectionHandler);
}
