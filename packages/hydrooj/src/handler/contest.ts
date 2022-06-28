import AdmZip from 'adm-zip';
import moment from 'moment-timezone';
import { ObjectID } from 'mongodb';
import { Time } from '@hydrooj/utils/lib/utils';
import {
    ContestNotFoundError, ContestNotLiveError, ForbiddenError, InvalidTokenError,
    PermissionError, ValidationError,
} from '../error';
import { Tdoc } from '../interface';
import paginate from '../lib/paginate';
import { PERM, PRIV } from '../model/builtin';
import * as contest from '../model/contest';
import message from '../model/message';
import problem from '../model/problem';
import record from '../model/record';
import * as system from '../model/system';
import TaskModel from '../model/task';
import user from '../model/user';
import {
    Handler, param, Route, Types,
} from '../service/server';
import { registerResolver, registerValue } from './api';

registerValue('Contest', [
    ['_id', 'ObjectID!'],
    ['domainId', 'String!'],
    ['docId', 'ObjectID!'],
    ['owner', 'Int!'],
    ['beginAt', 'Date!'],
    ['title', 'String!'],
    ['content', 'String!'],
    ['beginAt', 'Date!'],
    ['endAt', 'Date!'],
    ['attend', 'Int!'],
    ['pids', '[Int]!'],
    ['rated', 'Boolean!'],
]);

registerResolver(
    'Query', 'contest(id: ObjectID!)', 'Contest',
    async (arg, ctx) => {
        arg.id = new ObjectID(arg.id);
        ctx.tdoc = await contest.get(ctx.args.domainId, new ObjectID(arg.id));
        if (!ctx.tdoc) throw new ContestNotFoundError(ctx.args.domainId, arg.id);
        return ctx.tdoc;
    },
    'Get a contest by ID',
);

TaskModel.Worker.addHandler('contest', async (doc) => {
    const tdoc = await contest.get(doc.domainId, doc.tid);
    if (!tdoc) return;
    const tasks = [];
    for (const op of doc.operation) {
        if (op === 'unhide') {
            for (const pid of tdoc.pids) {
                tasks.push(problem.edit(doc.domainId, pid, { hidden: false }));
            }
        } else if (op === 'unlock') tasks.push(contest.recalcStatus(doc.domainId, doc.tid));
    }
    await Promise.all(tasks);
});

export class ContestListHandler extends Handler {
    @param('rule', Types.Range(contest.RULES), true)
    @param('page', Types.PositiveInt, true)
    async get(domainId: string, rule = '', page = 1) {
        const cursor = contest.getMulti(domainId, rule ? { rule } : { rule: { $ne: 'homework' } });
        const qs = rule ? `rule=${rule}` : '';
        const [tdocs, tpcount] = await paginate(cursor, page, system.get('pagination.contest'));
        const tids = [];
        for (const tdoc of tdocs) tids.push(tdoc.docId);
        const tsdict = await contest.getListStatus(domainId, this.user._id, tids);
        this.response.template = 'contest_main.html';
        this.response.body = {
            page, tpcount, qs, rule, tdocs, tsdict,
        };
    }
}

export class ContestDetailHandler extends Handler {
    @param('tid', Types.ObjectID)
    @param('page', Types.PositiveInt, true)
    async prepare(domainId: string, tid: ObjectID) {
        const tdoc = await contest.get(domainId, tid);
        if (tdoc.assign?.length && !this.user.own(tdoc)) {
            const groups = await user.listGroup(domainId, this.user._id);
            if (!Set.intersection(tdoc.assign, groups.map((i) => i.name)).size) {
                throw new ForbiddenError('You are not assigned.');
            }
        }
    }

    @param('tid', Types.ObjectID)
    @param('page', Types.PositiveInt, true)
    async get(domainId: string, tid: ObjectID, page = 1) {
        const [tdoc, tsdoc] = await Promise.all([
            contest.get(domainId, tid),
            contest.getStatus(domainId, tid, this.user._id),
        ]);
        this.response.template = 'contest_detail.html';
        const udict = await user.getList(domainId, [tdoc.owner]);
        this.response.body = {
            tdoc, tsdoc, udict, page,
        };
        if (contest.isNotStarted(tdoc)) return;
        const pdict = await problem.getList(domainId, tdoc.pids, true, undefined, undefined, problem.PROJECTION_CONTEST_LIST);
        const psdict = {};
        let rdict = {};
        if (tsdoc) {
            if (tsdoc.attend && !tsdoc.startAt && contest.isOngoing(tdoc)) {
                await contest.setStatus(domainId, tid, this.user._id, { startAt: new Date() });
                tsdoc.startAt = new Date();
            }
            for (const pdetail of tsdoc.journal || []) psdict[pdetail.pid] = pdetail;
            if (contest.canShowSelfRecord.call(this, tdoc)) {
                rdict = await record.getList(domainId, Object.values(psdict).map((i: any) => i.rid));
            } else {
                for (const i in psdict) rdict[psdict[i].rid] = { _id: psdict[i].rid };
            }
            if (tdoc.duration && tsdoc.attend) {
                tsdoc.endAt = moment(tsdoc.startAt).add(tdoc.duration, 'h').tz(this.user.timezone).format('YYYY-MM-DD HH:mm:ss');
            }
        }
        Object.assign(this.response.body, { pdict, psdict, rdict });
    }

    @param('tid', Types.ObjectID)
    @param('code', Types.String, true)
    async postAttend(domainId: string, tid: ObjectID, code = '') {
        const tdoc = await contest.get(domainId, tid);
        if (contest.isDone(tdoc)) throw new ContestNotLiveError(tid);
        if (tdoc._code && code !== tdoc._code) throw new InvalidTokenError(code);
        await contest.attend(domainId, tid, this.user._id);
        this.back();
    }

    @param('tid', Types.ObjectID)
    async postDelete(domainId: string, tid: ObjectID) {
        const tdoc = await contest.get(domainId, tid);
        if (!this.user.own(tdoc)) this.checkPerm(PERM.PERM_EDIT_CONTEST);
        await contest.del(domainId, tid);
        await record.updateMulti(domainId, { domainId, contest: tid }, undefined, undefined, { contest: '' });
        await TaskModel.deleteMany({
            type: 'schedule', subType: 'contest', domainId, tid,
        });
        this.response.redirect = this.url('contest_main');
    }
}

export class ContestBroadcastHandler extends Handler {
    @param('tid', Types.ObjectID)
    async get(domainId: string, tid: ObjectID) {
        const tdoc = await contest.get(domainId, tid);
        if (!this.user.own(tdoc)) throw new PermissionError('Boardcast Message');
        const path = [
            ['Hydro', 'homepage'],
            ['contest_main', 'contest_main'],
            [tdoc.title, 'contest_detail', { tid }, true],
            ['contest_broadcast'],
        ];
        this.response.template = 'contest_broadcast.html';
        this.response.body = path;
    }

    @param('tid', Types.ObjectID)
    @param('content', Types.Content)
    async post(domainId: string, tid: ObjectID, content: string) {
        const tdoc = await contest.get(domainId, tid);
        if (!this.user.own(tdoc)) throw new PermissionError('Broadcast Message');
        const tsdocs = await contest.getMultiStatus(domainId, { docId: tid }).toArray();
        const uids: number[] = Array.from(new Set(tsdocs.map((tsdoc) => tsdoc.uid)));
        await Promise.all(
            uids.map((uid) => message.send(this.user._id, uid, content, message.FLAG_ALERT)),
        );
        this.response.redirect = this.url('contest_detail', { tid });
    }
}

export class ContestScoreboardHandler extends Handler {
    @param('tid', Types.ObjectID)
    @param('page', Types.PositiveInt, true)
    @param('ignoreLock', Types.Boolean, true)
    async get(domainId: string, tid: ObjectID, page = 1, ignoreLock = false) {
        const tdoc = await contest.get(domainId, tid);
        if (ignoreLock && !this.user.own(tdoc)) {
            this.checkPerm(PERM.PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD);
        }
        const pdict = await problem.getList(domainId, tdoc.pids, true, undefined, false, [
            // Problem statistics display is allowed as we can view submission info in scoreboard.
            ...problem.PROJECTION_CONTEST_LIST, 'nSubmit', 'nAccept',
        ]);
        const [, rows, udict, , nPages] = await contest.getScoreboard.call(this, domainId, tid, false, page, ignoreLock);
        const path = [
            ['Hydro', 'homepage'],
            ['contest_main', 'contest_main'],
            [tdoc.title, 'contest_detail', { tid }, true],
            ['contest_scoreboard', null],
        ];
        this.response.template = 'contest_scoreboard.html';
        this.response.body = {
            tdoc, rows, path, udict, nPages, page, pdict,
        };
    }
}

export class ContestScoreboardDownloadHandler extends Handler {
    @param('tid', Types.ObjectID)
    @param('ext', Types.Range(['csv', 'html']))
    @param('ignoreLock', Types.Boolean, true)
    async get(domainId: string, tid: ObjectID, ext: string, ignoreLock = false) {
        await this.limitRate('scoreboard_download', 120, 3);
        const getContent = {
            csv: async (rows) => `\uFEFF${rows.map((c) => (c.map((i) => i.value?.toString().replace(/\n/g, ' ')).join(','))).join('\n')}`,
            html: (rows, tdoc) => this.renderHTML('contest_scoreboard_download_html.html', { rows, tdoc }),
        };
        const tdoc = await contest.get(domainId, tid);
        if (ignoreLock && !this.user.own(tdoc)) {
            this.checkPerm(PERM.PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD);
        }
        const [, rows] = await contest.getScoreboard.call(this, domainId, tid, true, 0, ignoreLock);
        this.binary(await getContent[ext](rows, tdoc), `${tdoc.title}.${ext}`);
    }
}

export class ContestEditHandler extends Handler {
    tdoc: Tdoc;

    @param('tid', Types.ObjectID, true)
    async prepare(domainId: string, tid: ObjectID) {
        if (tid) {
            this.tdoc = await contest.get(domainId, tid);
            if (!this.tdoc) throw new ContestNotFoundError(domainId, tid);
            if (!this.user.own(this.tdoc)) this.checkPerm(PERM.PERM_EDIT_CONTEST);
            else this.checkPerm(PERM.PERM_EDIT_CONTEST_SELF);
        } else this.checkPerm(PERM.PERM_CREATE_CONTEST);
    }

    @param('tid', Types.ObjectID, true)
    async get(domainId: string, tid: ObjectID) {
        this.response.template = 'contest_edit.html';
        const rules = {};
        for (const i in contest.RULES) rules[i] = contest.RULES[i].TEXT;
        let ts = Date.now();
        ts = ts - (ts % (15 * Time.minute)) + 15 * Time.minute;
        this.response.body = {
            rules,
            tdoc: this.tdoc,
            contestDuration: tid ? this.tdoc.duration : '',
            pids: tid ? this.tdoc.pids.join(',') : '',
            beginAt: this.tdoc?.beginAt || new Date(ts),
            endAt: this.tdoc?.endAt || new Date(ts + 2 * Time.hour),
            page_name: tid ? 'contest_edit' : 'contest_create',
        };
    }

    @param('tid', Types.ObjectID, true)
    @param('beginAt', Types.DateTime)
    @param('endAt', Types.DateTime)
    @param('title', Types.Title)
    @param('content', Types.Content)
    @param('rule', Types.Range(Object.keys(contest.RULES).filter((i) => i !== 'homework')))
    @param('pids', Types.Content)
    @param('rated', Types.Boolean)
    @param('code', Types.String, true)
    @param('autoHide', Types.Boolean, true)
    @param('assign', Types.CommaSeperatedArray, true)
    @param('lock', Types.UnsignedInt, true)
    @param('contestDuration', Types.Float, true)
    async post(
        domainId: string, tid: ObjectID, beginAt: string, endAt: string, title: string,
        content: string, rule: string, _pids: string, rated = false, _code = '',
        autoHide = false, assign: string[] = null, lock: number = null, contestDuration?: number,
    ) {
        if (autoHide) this.checkPerm(PERM.PERM_EDIT_PROBLEM);
        const pids = _pids.replace(/，/g, ',').split(',').map((i) => +i).filter((i) => i);
        const beginAtMoment = moment.tz(beginAt, this.user.timeZone);
        if (!beginAtMoment.isValid()) throw new ValidationError('beginAt');
        const endAtMoment = moment.tz(endAt, this.user.timeZone);
        if (!endAtMoment.isValid()) throw new ValidationError('endAt');
        if (beginAtMoment.isSameOrAfter(endAt)) throw new ValidationError('beginAt', 'endAt');
        const beginAtDate = beginAtMoment.toDate();
        const endAtDate = endAtMoment.toDate();
        const lockAt = lock ? moment(endAt).add(-lock, 'minutes').toDate() : null;
        await problem.getList(domainId, pids, this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN) || this.user._id, this.user.group, true);
        if (tid) {
            await contest.edit(domainId, tid, {
                title, content, rule, beginAt: beginAtDate, endAt: endAtDate, pids, rated, duration: contestDuration,
            });
            if (this.tdoc.beginAt !== beginAtDate || this.tdoc.endAt !== endAtDate
                || Array.isDiff(this.tdoc.pids, pids) || this.tdoc.rule !== rule
                || lockAt !== this.tdoc.lockAt) {
                await contest.recalcStatus(domainId, this.tdoc.docId);
            }
        } else {
            tid = await contest.add(domainId, title, content, this.user._id, rule, beginAtDate,
                endAtDate, pids, rated, { duration: contestDuration });
        }
        const task = {
            type: 'schedule', subType: 'contest', domainId, tid,
        };
        await TaskModel.deleteMany(task);
        if (Date.now() <= endAtDate.getTime() && autoHide) {
            // eslint-disable-next-line no-await-in-loop
            await Promise.all(pids.map((pid) => problem.edit(domainId, pid, { hidden: true })));
            await TaskModel.add({
                ...task,
                operation: ['unhide'],
                executeAfter: endAtDate,
            });
        }
        if (lock && lockAt <= endAtDate) {
            await TaskModel.add({
                ...task,
                operation: ['unlock'],
                executeAfter: endAtDate,
            });
        }
        await contest.edit(domainId, tid, {
            assign, _code, autoHide, lockAt,
        });
        this.response.body = { tid };
        this.response.redirect = this.url('contest_detail', { tid });
    }
}

export class ContestCodeHandler extends Handler {
    @param('tid', Types.ObjectID)
    @param('all', Types.Boolean)
    async get(domainId: string, tid: ObjectID, all: boolean) {
        await this.limitRate('contest_code', 3600, 60);
        const [tdoc, tsdocs] = await contest.getAndListStatus(domainId, tid);
        if (!this.user.own(tdoc) && !this.user.hasPriv(PRIV.PRIV_READ_RECORD_CODE)) {
            this.checkPerm(PERM.PERM_READ_RECORD_CODE);
        }
        if (!contest.canShowRecord.call(this, tdoc as any, true)) {
            throw new PermissionError(PERM.PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD);
        }
        const rnames = {};
        for (const tsdoc of tsdocs) {
            if (all) {
                for (const j of tsdoc.journal || []) {
                    let name = `U${tsdoc.uid}_P${j.pid}_R${j.rid}`;
                    if (typeof j.score === 'number') name += `_S${j.status || 0}@${j.score}`;
                    rnames[j.rid] = name;
                }
            } else {
                for (const pid in tsdoc.detail || {}) {
                    let name = `U${tsdoc.uid}_P${pid}_R${tsdoc.detail[pid].rid}`;
                    if (typeof tsdoc.detail[pid].score === 'number') name += `_S${tsdoc.detail[pid].status || 0}@${tsdoc.detail[pid].score}`;
                    rnames[tsdoc.detail[pid].rid] = name;
                }
            }
        }
        const zip = new AdmZip();
        const rdocs = await record.getMulti(domainId, {
            _id: { $in: Array.from(Object.keys(rnames)).map((id) => new ObjectID(id)) },
        }).toArray();
        for (const rdoc of rdocs) {
            zip.addFile(`${rnames[rdoc._id.toHexString()]}.${rdoc.lang}`, Buffer.from(rdoc.code));
        }
        this.binary(zip.toBuffer(), `${tdoc.title}.zip`);
    }
}

export async function apply() {
    Route('contest_create', '/contest/create', ContestEditHandler);
    Route('contest_main', '/contest', ContestListHandler, PERM.PERM_VIEW_CONTEST);
    Route('contest_detail', '/contest/:tid', ContestDetailHandler, PERM.PERM_VIEW_CONTEST);
    Route('contest_broadcast', '/contest/:tid/broadcast', ContestBroadcastHandler);
    Route('contest_edit', '/contest/:tid/edit', ContestEditHandler, PERM.PERM_VIEW_CONTEST);
    Route('contest_scoreboard', '/contest/:tid/scoreboard', ContestScoreboardHandler, PERM.PERM_VIEW_CONTEST);
    Route('contest_scoreboard_download', '/contest/:tid/export/:ext', ContestScoreboardDownloadHandler, PERM.PERM_VIEW_CONTEST);
    Route('contest_code', '/contest/:tid/code', ContestCodeHandler, PERM.PERM_VIEW_CONTEST);
}

global.Hydro.handler.contest = apply;
