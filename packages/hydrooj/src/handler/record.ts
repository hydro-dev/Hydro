import {
    omit, pick, throttle, uniqBy,
} from 'lodash';
import { Filter, ObjectId } from 'mongodb';
import {
    ContestNotFoundError, HackRejudgeFailedError,
    PermissionError, PretestRejudgeFailedError, ProblemConfigError,
    ProblemNotFoundError, RecordNotFoundError, UserNotFoundError,
} from '../error';
import { RecordDoc, Tdoc } from '../interface';
import { PERM, PRIV, STATUS } from '../model/builtin';
import * as contest from '../model/contest';
import problem, { ProblemDoc } from '../model/problem';
import record from '../model/record';
import { langs } from '../model/setting';
import storage from '../model/storage';
import * as system from '../model/system';
import TaskModel from '../model/task';
import user from '../model/user';
import {
    ConnectionHandler, param, subscribe, Types,
} from '../service/server';
import { buildProjection, Time } from '../utils';
import { ContestDetailBaseHandler } from './contest';
import { postJudge } from './judge';

class RecordListHandler extends ContestDetailBaseHandler {
    @param('page', Types.PositiveInt, true)
    @param('pid', Types.ProblemId, true)
    @param('tid', Types.ObjectId, true)
    @param('uidOrName', Types.UidOrName, true)
    @param('lang', Types.String, true)
    @param('status', Types.Int, true)
    @param('fullStatus', Types.Boolean)
    @param('all', Types.Boolean)
    @param('allDomain', Types.Boolean)
    async get(
        domainId: string, page = 1, pid?: string | number, tid?: ObjectId,
        uidOrName?: string, lang?: string, status?: number, full = false,
        all = false, allDomain = false,
    ) {
        const notification = [];
        let tdoc = null;
        let invalid = false;
        this.response.template = 'record_main.html';
        const q: Filter<RecordDoc> = { contest: tid };
        if (full) uidOrName = this.user._id.toString();
        if (uidOrName) {
            const udoc = await user.getById(domainId, +uidOrName)
                || await user.getByUname(domainId, uidOrName)
                || await user.getByEmail(domainId, uidOrName);
            if (udoc) q.uid = udoc._id;
            else invalid = true;
        }
        if (q.uid !== this.user._id) this.checkPerm(PERM.PERM_VIEW_RECORD);
        if (tid) {
            tdoc = await contest.get(domainId, tid);
            this.tdoc = tdoc;
            if (!tdoc) throw new ContestNotFoundError(domainId, pid);
            if (!contest.canShowScoreboard.call(this, tdoc, true)) throw new PermissionError(PERM.PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD);
            if (!contest[q.uid === this.user._id ? 'canShowSelfRecord' : 'canShowRecord'].call(this, tdoc, true)) {
                throw new PermissionError(PERM.PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD);
            }
            if (!(await contest.getStatus(domainId, tid, this.user._id))?.attend) {
                const name = tdoc.rule === 'homework'
                    ? "You haven't claimed this homework yet."
                    : "You haven't attended this contest yet.";
                notification.push({ name, args: { type: 'note' }, checker: () => true });
            }
        }
        if (pid) {
            if (typeof pid === 'string' && tdoc && /^[A-Z]$/.test(pid)) {
                pid = tdoc.pids[Number.parseInt(pid, 36) - 10];
            }
            const pdoc = await problem.get(domainId, pid);
            if (pdoc) q.pid = pdoc.docId;
            else invalid = true;
        }
        if (lang) q.lang = lang;
        if (typeof status === 'number') q.status = status;
        if (all) {
            this.checkPerm(PERM.PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD);
            this.checkPerm(PERM.PERM_VIEW_HOMEWORK_HIDDEN_SCOREBOARD);
            delete q.contest;
        }
        if (allDomain) {
            this.checkPriv(PRIV.PRIV_MANAGE_ALL_DOMAIN);
            delete q.contest;
            q._id = { $gt: Time.getObjectID(new Date(Date.now() - 10 * Time.week)) };
        }
        let cursor = record.getMulti(allDomain ? '' : domainId, q).sort('_id', -1);
        if (!full) cursor = cursor.project(buildProjection(record.PROJECTION_LIST));
        const limit = full ? 10 : system.get('pagination.record');
        let rdocs = invalid
            ? [] as RecordDoc[]
            : await cursor.skip((page - 1) * limit).limit(limit).toArray();
        const canViewProblem = tid || this.user.hasPerm(PERM.PERM_VIEW_PROBLEM);
        const canViewHiddenProblem = this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN) || this.user._id;
        const [udict, pdict] = full ? [{}, {}]
            : await Promise.all([
                user.getList(domainId, rdocs.map((rdoc) => rdoc.uid)),
                canViewProblem
                    ? problem.getList(domainId, rdocs.map((rdoc) => rdoc.pid), canViewHiddenProblem, false, problem.PROJECTION_LIST)
                    : Object.fromEntries(uniqBy(rdocs, 'pid').map((rdoc) => [rdoc.pid, { ...problem.default, pid: rdoc.pid }])),
            ]);
        if (this.tdoc && !this.user.own(this.tdoc) && !this.user.hasPerm(PERM.PERM_EDIT_CONTEST)) {
            rdocs = rdocs.map((i) => contest.applyProjection(tdoc, i, this.user));
        }
        this.response.body = {
            page,
            rdocs,
            tdoc,
            pdict,
            udict,
            all,
            allDomain,
            filterPid: pid,
            filterTid: tid,
            filterUidOrName: uidOrName,
            filterLang: lang,
            filterStatus: status,
            notification,
        };
        if (this.user.hasPriv(PRIV.PRIV_VIEW_JUDGE_STATISTICS) && !full) {
            this.response.body.statistics = await record.stat(allDomain ? undefined : domainId);
        }
    }
}

class RecordDetailHandler extends ContestDetailBaseHandler {
    rdoc: RecordDoc;

    @param('rid', Types.ObjectId)
    async prepare(domainId: string, rid: ObjectId) {
        this.rdoc = await record.get(domainId, rid);
        if (!this.rdoc) throw new RecordNotFoundError(rid);
        if (this.rdoc.uid !== this.user._id) this.checkPerm(PERM.PERM_VIEW_RECORD);
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
        this.response.disposition = `attachment; filename="${langs[lang]?.code_file || `foo.${this.rdoc.lang}`}"`;
    }

    @param('rid', Types.ObjectId)
    @param('download', Types.Boolean)
    @param('rev', Types.ObjectId, true)
    // eslint-disable-next-line consistent-return
    async get(domainId: string, rid: ObjectId, download = false, rev?: ObjectId) {
        let rdoc = this.rdoc;
        const allRev = await record.collHistory.find({ rid }).project({ _id: 1, judgeAt: 1 }).sort({ _id: -1 }).toArray();
        const allRevs: Record<string, Date> = Object.fromEntries(allRev.map((i) => [i._id.toString(), i.judgeAt]));
        if (rev && allRevs[rev.toString()]) {
            rdoc = { ...rdoc, ...omit(await record.collHistory.findOne({ _id: rev }), ['_id']), progress: null };
        }
        let canViewDetail = true;
        if (rdoc.contest?.toString().startsWith('0'.repeat(23))) {
            if (rdoc.uid !== this.user._id) throw new PermissionError(PERM.PERM_READ_RECORD_CODE);
        } else if (rdoc.contest) {
            this.tdoc = await contest.get(domainId, rdoc.contest);
            let canView = this.user.own(this.tdoc);
            canView ||= contest.canShowRecord.call(this, this.tdoc);
            canView ||= contest.canShowSelfRecord.call(this, this.tdoc, true) && rdoc.uid === this.user._id;
            if (!canView && rdoc.uid !== this.user._id) throw new PermissionError(rid);
            canViewDetail = canView;
            this.args.tid = this.tdoc.docId;
            if (!this.user.own(this.tdoc) && !this.user.hasPerm(PERM.PERM_EDIT_CONTEST)) {
                this.rdoc = contest.applyProjection(this.tdoc, this.rdoc, this.user);
            }
        }

        // eslint-disable-next-line prefer-const
        let [pdoc, self, udoc] = await Promise.all([
            problem.get(rdoc.domainId, rdoc.pid, problem.PROJECTION_LIST.concat('config')),
            problem.getStatus(domainId, rdoc.pid, this.user._id),
            user.getById(domainId, rdoc.uid),
        ]);

        let canViewCode = rdoc.uid === this.user._id;
        canViewCode ||= this.user.hasPriv(PRIV.PRIV_READ_RECORD_CODE);
        canViewCode ||= this.user.hasPerm(PERM.PERM_READ_RECORD_CODE);
        canViewCode ||= this.user.hasPerm(PERM.PERM_READ_RECORD_CODE_ACCEPT) && self?.status === STATUS.STATUS_ACCEPTED;
        if (this.tdoc) {
            const tsdoc = await contest.getStatus(domainId, this.tdoc.docId, this.user._id);
            canViewCode ||= this.user.own(this.tdoc);
            if (this.tdoc.allowViewCode && contest.isDone(this.tdoc)) {
                canViewCode ||= tsdoc?.attend;
            }
            if (!tsdoc?.attend && pdoc && !problem.canViewBy(pdoc, this.user)) throw new PermissionError(PERM.PERM_VIEW_PROBLEM_HIDDEN);
        } else if (pdoc && !problem.canViewBy(pdoc, this.user)) throw new PermissionError(PERM.PERM_VIEW_PROBLEM_HIDDEN);
        if (!canViewCode) {
            rdoc.code = '';
            rdoc.files = {};
            rdoc.compilerTexts = [];
        } else if (download) return await this.download();
        this.response.template = 'record_detail.html';
        this.response.body = {
            udoc, rdoc: canViewDetail ? rdoc : pick(rdoc, ['_id', 'lang', 'code']), pdoc, tdoc: this.tdoc, rev, allRevs,
        };
    }

    @param('rid', Types.ObjectId)
    async post() {
        this.checkPerm(PERM.PERM_REJUDGE);
        if (this.rdoc.files?.hack) throw new HackRejudgeFailedError();
        if (this.rdoc.contest?.toString().startsWith('0'.repeat(23))) throw new PretestRejudgeFailedError();
    }

    @param('rid', Types.ObjectId)
    async postRejudge(domainId: string, rid: ObjectId) {
        const pdoc = await problem.get(domainId, this.rdoc.pid);
        if (!pdoc?.config || typeof pdoc.config === 'string') throw new ProblemConfigError();
        const priority = await record.submissionPriority(this.user._id, -20);
        const rdoc = await record.reset(domainId, rid, true);
        this.ctx.broadcast('record/change', rdoc);
        await record.judge(domainId, rid, priority, this.rdoc.contest ? { detail: false } : {});
        this.back();
    }

    @param('rid', Types.ObjectId)
    async postCancel(domainId: string, rid: ObjectId) {
        const $set = {
            status: STATUS.STATUS_CANCELED,
            score: 0,
            time: 0,
            memory: 0,
            testCases: [{
                id: 0, subtaskId: 0, status: 9, score: 0, time: 0, memory: 0, message: 'score canceled',
            }],
            subtasks: {},
        };
        const [latest] = await Promise.all([
            record.update(domainId, rid, $set),
            TaskModel.deleteMany({ rid: this.rdoc._id }),
        ]);
        if (latest) {
            this.ctx.broadcast('record/change', latest);
            await postJudge(latest);
        }
        this.back();
    }
}

class RecordMainConnectionHandler extends ConnectionHandler {
    all = false;
    allDomain = false;
    tid: string;
    uid: number;
    pid: number;
    status: number;
    pretest = false;
    tdoc: Tdoc;
    applyProjection = false;
    noTemplate = false;
    queue: Map<string, () => Promise<any>> = new Map();
    throttleQueueClear: () => void;

    @param('tid', Types.ObjectId, true)
    @param('pid', Types.ProblemId, true)
    @param('uidOrName', Types.UidOrName, true)
    @param('status', Types.Int, true)
    @param('pretest', Types.Boolean)
    @param('all', Types.Boolean)
    @param('allDomain', Types.Boolean)
    @param('noTemplate', Types.Boolean, true)
    async prepare(
        domainId: string, tid?: ObjectId, pid?: string | number, uidOrName?: string,
        status?: number, pretest = false, all = false, allDomain = false, noTemplate = false,
    ) {
        if (tid) {
            this.tdoc = await contest.get(domainId, tid);
            if (!this.tdoc) throw new ContestNotFoundError(domainId, tid);
            if (pretest || contest.canShowScoreboard.call(this, this.tdoc, true)) this.tid = tid.toHexString();
            else throw new PermissionError(PERM.PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD);
            if (!this.user.own(this.tdoc) && !this.user.hasPerm(PERM.PERM_EDIT_CONTEST)) {
                this.applyProjection = true;
            }
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
        if (this.uid !== this.user._id) this.checkPerm(PERM.PERM_VIEW_RECORD);
        if (pid) {
            const pdoc = await problem.get(domainId, pid);
            if (pdoc) this.pid = pdoc.docId;
            else throw new ProblemNotFoundError(domainId, pid);
        }
        if (status) this.status = status;
        if (all) {
            this.checkPerm(PERM.PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD);
            this.checkPerm(PERM.PERM_VIEW_HOMEWORK_HIDDEN_SCOREBOARD);
            this.all = true;
        }
        if (allDomain) {
            this.checkPriv(PRIV.PRIV_MANAGE_ALL_DOMAIN);
            this.allDomain = true;
        }
        this.noTemplate = noTemplate;
        this.throttleQueueClear = throttle(this.queueClear, 100, { trailing: true });
    }

    async message(msg: { rids: string[] }) {
        if (!(msg.rids instanceof Array)) return;
        const rids = msg.rids.map((id) => new ObjectId(id));
        const rdocs = await record.getMulti(this.args.domainId, { _id: { $in: rids } })
            .project<RecordDoc>(buildProjection(record.PROJECTION_LIST)).toArray();
        for (const rdoc of rdocs) this.onRecordChange(rdoc);
    }

    @subscribe('record/change')
    async onRecordChange(rdoc: RecordDoc) {
        if (!this.allDomain) {
            if (rdoc.domainId !== this.args.domainId) return;
            if (!this.pretest && typeof rdoc.input === 'string') return;
            if (!this.all) {
                if (rdoc.contest && ![this.tid, '000000000000000000000000'].includes(rdoc.contest.toString())) return;
                if (this.tid && rdoc.contest?.toString() !== '0'.repeat(24)) {
                    if (contest.isLocked(this.tdoc)) return;
                    if (!contest.canShowSelfRecord.call(this, this.tdoc, true)) return;
                }
            }
        }
        if (typeof this.pid === 'number' && rdoc.pid !== this.pid) return;
        if (typeof this.uid === 'number' && rdoc.uid !== this.uid) return;

        let [udoc, pdoc] = await Promise.all([
            user.getById(this.args.domainId, rdoc.uid),
            problem.get(rdoc.domainId, rdoc.pid),
        ]);
        const tdoc = this.tid ? this.tdoc || await contest.get(rdoc.domainId, new ObjectId(this.tid)) : null;
        if (pdoc && !rdoc.contest) {
            if (!problem.canViewBy(pdoc, this.user)) pdoc = null;
            if (!this.user.hasPerm(PERM.PERM_VIEW_PROBLEM)) pdoc = null;
        }
        if (this.applyProjection && typeof rdoc.input !== 'string') rdoc = contest.applyProjection(tdoc, rdoc, this.user);
        if (this.pretest) {
            this.queueSend(rdoc._id.toHexString(), async () => ({ rdoc: omit(rdoc, ['code', 'input']) }));
        } else if (this.noTemplate) {
            this.queueSend(rdoc._id.toHexString(), async () => ({ rdoc }));
        } else {
            this.queueSend(rdoc._id.toHexString(), async () => ({
                html: await this.renderHTML('record_main_tr.html', {
                    rdoc, udoc, pdoc, tdoc, allDomain: this.allDomain,
                }),
            }));
        }
    }

    queueSend(rid: string, fn: () => Promise<any>) {
        this.queue.set(rid, fn);
        this.throttleQueueClear();
    }

    async queueClear() {
        await Promise.all([...this.queue.values()].map(async (fn) => this.send(await fn())));
        this.queue.clear();
    }
}

class RecordDetailConnectionHandler extends ConnectionHandler {
    pdoc: ProblemDoc;
    tdoc?: Tdoc;
    rid: string = '';
    disconnectTimeout: NodeJS.Timeout;
    throttleSend: any;
    applyProjection = false;
    noTemplate = false;
    canViewCode = false;

    @param('rid', Types.ObjectId)
    @param('noTemplate', Types.Boolean, true)
    async prepare(domainId: string, rid: ObjectId, noTemplate = false) {
        const rdoc = await record.get(domainId, rid);
        if (!rdoc) return;
        if (rdoc.contest && ![record.RECORD_GENERATE, record.RECORD_PRETEST].some((i) => i.toHexString() === rdoc.contest.toHexString())) {
            this.tdoc = await contest.get(domainId, rdoc.contest);
            let canView = this.user.own(this.tdoc);
            canView ||= contest.canShowRecord.call(this, this.tdoc);
            canView ||= this.user._id === rdoc.uid && contest.canShowSelfRecord.call(this, this.tdoc);
            if (!canView) throw new PermissionError(PERM.PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD);
            if (!this.user.own(this.tdoc) && !this.user.hasPerm(PERM.PERM_EDIT_CONTEST)) {
                this.applyProjection = true;
            }
        }
        const [pdoc, self] = await Promise.all([
            problem.get(rdoc.domainId, rdoc.pid),
            problem.getStatus(domainId, rdoc.pid, this.user._id),
        ]);

        this.canViewCode = rdoc.uid === this.user._id;
        this.canViewCode ||= this.user.hasPriv(PRIV.PRIV_READ_RECORD_CODE);
        this.canViewCode ||= this.user.hasPerm(PERM.PERM_READ_RECORD_CODE);
        this.canViewCode ||= this.user.hasPerm(PERM.PERM_READ_RECORD_CODE_ACCEPT) && self?.status === STATUS.STATUS_ACCEPTED;

        if (!rdoc.contest || this.user._id !== rdoc.uid) {
            if (!problem.canViewBy(pdoc, this.user)) throw new PermissionError(PERM.PERM_VIEW_PROBLEM_HIDDEN);
        }

        this.pdoc = pdoc;
        this.noTemplate = noTemplate;
        this.throttleSend = throttle(this.sendUpdate, 1000, { trailing: true });
        this.rid = rid.toString();
        this.onRecordChange(rdoc);
    }

    async sendUpdate(rdoc: RecordDoc) {
        if (this.noTemplate) {
            this.send({ rdoc });
        } else {
            this.send({
                status: rdoc.status,
                status_html: await this.renderHTML('record_detail_status.html', { rdoc, pdoc: this.pdoc }),
                summary_html: await this.renderHTML('record_detail_summary.html', { rdoc, pdoc: this.pdoc }),
            });
        }
    }

    @subscribe('record/change')
    // eslint-disable-next-line
    async onRecordChange(rdoc: RecordDoc, $set?: any, $push?: any) {
        if (rdoc._id.toString() !== this.rid) return;
        if (this.disconnectTimeout) {
            clearTimeout(this.disconnectTimeout);
            this.disconnectTimeout = null;
        }
        if (this.applyProjection) rdoc = contest.applyProjection(this.tdoc, rdoc, this.user);
        // TODO: frontend doesn't support incremental update
        // if ($set) this.send({ $set, $push });
        if (!this.canViewCode) {
            rdoc = {
                ...rdoc,
                code: '',
                compilerTexts: [],
            };
        }
        if (![STATUS.STATUS_WAITING, STATUS.STATUS_JUDGING, STATUS.STATUS_COMPILING, STATUS.STATUS_FETCHED].includes(rdoc.status)) {
            this.disconnectTimeout = setTimeout(() => this.close(4001, 'Ended'), 30000);
        }
        this.throttleSend(rdoc);
    }
}

export async function apply(ctx) {
    ctx.Route('record_main', '/record', RecordListHandler);
    ctx.Route('record_detail', '/record/:rid', RecordDetailHandler);
    ctx.Connection('record_conn', '/record-conn', RecordMainConnectionHandler);
    ctx.Connection('record_detail_conn', '/record-detail-conn', RecordDetailConnectionHandler);
}
