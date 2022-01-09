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
    ['fullScore', '[Int]!'],
    ['rated', 'Boolean!'],
]);

registerResolver(
    'Query', 'contest(id: ObjectID!)', 'Contest',
    async (arg, ctx) => {
        arg.id = new ObjectID(arg.id);
        ctx.tdoc = await contest.get(ctx.domainId, new ObjectID(arg.id));
        if (!ctx.tdoc) throw new ContestNotFoundError(ctx.domainId, arg.id);
        return ctx.tdoc;
    },
    'Get a contest by ID',
);

TaskModel.Worker.addHandler('contest.problemHide', async (doc) => {
    const tdoc = await contest.get(doc.domainId, doc.tid);
    if (!tdoc) return;
    for (const pid of tdoc.pids) {
        // eslint-disable-next-line no-await-in-loop
        await problem.edit(doc.domainId, pid, { hidden: false });
    }
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
        if (tdoc.assign) {
            const groups = await user.listGroup(domainId, this.user._id);
            if (!Set.intersection(tdoc.assign, groups.map((i) => i.name)).size) {
                throw new ForbiddenError('You are not assigned.');
            }
        }
    }

    @param('tid', Types.ObjectID)
    @param('page', Types.PositiveInt, true)
    async get(domainId: string, tid: ObjectID, page = 1) {
        const tdoc = await contest.get(domainId, tid);
        this.response.template = 'contest_detail.html';
        const [tsdoc, pdict] = await Promise.all([
            contest.getStatus(domainId, tdoc.docId, this.user._id),
            problem.getList(domainId, tdoc.pids, true),
        ]);
        const psdict = {};
        let rdict = {};
        if (tsdoc) {
            for (const pdetail of tsdoc.journal || []) psdict[pdetail.pid] = pdetail;
            if (contest.canShowSelfRecord.call(this, tdoc)) {
                const q = [];
                for (const i in psdict) q.push(psdict[i].rid);
                rdict = await record.getList(domainId, q);
            } else {
                for (const i in psdict) rdict[psdict[i].rid] = { _id: psdict[i].rid };
            }
        }
        const udict = await user.getList(domainId, [tdoc.owner]);
        this.response.body = {
            tdoc, tsdoc, udict, pdict, psdict, rdict, page,
        };
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
        await TaskModel.deleteMany({
            type: 'schedule', subType: 'contest.problemHide', domainId, tid,
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
    async get(domainId: string, tid: ObjectID, page = 1) {
        const [tdoc, rows, udict, , nPages] = await contest.getScoreboard.call(this, domainId, tid, false, page);
        const path = [
            ['Hydro', 'homepage'],
            ['contest_main', 'contest_main'],
            [tdoc.title, 'contest_detail', { tid }, true],
            ['contest_scoreboard', null],
        ];
        this.response.template = 'contest_scoreboard.html';
        this.response.body = {
            tdoc, rows, path, udict, nPages, page,
        };
    }
}

export class ContestScoreboardDownloadHandler extends Handler {
    @param('tid', Types.ObjectID)
    @param('ext', Types.Range(['csv', 'html']))
    async get(domainId: string, tid: ObjectID, ext: string) {
        await this.limitRate('scoreboard_download', 120, 3);
        const getContent = {
            csv: async (rows) => `\uFEFF${rows.map((c) => (c.map((i) => i.value).join(','))).join('\n')}`,
            html: (rows, tdoc) => this.renderHTML('contest_scoreboard_download_html.html', { rows, tdoc }),
        };
        const [tdoc, rows] = await contest.getScoreboard.call(this, domainId, tid, true, 0);
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
        const path = [
            ['Hydro', 'homepage'],
            ['contest_main', 'contest_main'],
            ...tid
                ? [
                    [this.tdoc.title, 'contest_detail', { tid: this.tdoc.docId }, true],
                    ['contest_edit', null],
                ]
                : [['contest_create', null]],
        ];
        let ts = new Date().getTime();
        ts = ts - (ts % (15 * Time.minute)) + 15 * Time.minute;
        const dt = this.tdoc?.beginAt || new Date(ts);
        this.response.body = {
            rules,
            tdoc: this.tdoc,
            duration: tid ? (this.tdoc.endAt.getTime() - this.tdoc.beginAt.getTime()) / Time.hour : 2,
            path,
            pids: tid ? this.tdoc.pids.join(',') : '',
            fullScore: tid ? this.tdoc.fullScore ? this.tdoc.fullScore.join(',') : '' : '',
            date_text: dt.format('%Y-%m-%d'),
            time_text: dt.format('%H:%M'),
            page_name: tid ? 'contest_edit' : 'contest_create',
        };
    }

    @param('tid', Types.ObjectID, true)
    @param('beginAtDate', Types.Date)
    @param('beginAtTime', Types.Time)
    @param('duration', Types.Float)
    @param('title', Types.Title)
    @param('content', Types.Content)
    @param('rule', Types.Range(Object.keys(contest.RULES).filter((i) => i !== 'homework')))
    @param('pids', Types.Content)
    @param('fullScore', Types.Content, true)
    @param('rated', Types.Boolean)
    @param('code', Types.String, true)
    @param('autoHide', Types.String, true)
    @param('assign', Types.Array, true)
    async post(
        domainId: string, tid: ObjectID, beginAtDate: string, beginAtTime: string, duration: number,
        title: string, content: string, rule: string, _pids: string, rated = false, _fullScore: string,
        _code = '', autoHide = false, assign: string[] = null,
    ) {
        if (autoHide) this.checkPerm(PERM.PERM_EDIT_PROBLEM);
        const pids = _pids.replace(/，/g, ',').split(',').map((i) => +i).filter((i) => i);
        const fullScore = _fullScore.replace(/，/g, ',').split(',').map((i) => +i).filter((i) => i);
        if (rule === 'Codeforces' && fullScore.length !== 1 && fullScore.length !== pids.length) throw new ValidationError('fullScore');
        const beginAtMoment = moment.tz(`${beginAtDate} ${beginAtTime}`, this.user.timeZone);
        if (!beginAtMoment.isValid()) throw new ValidationError('beginAtDate', 'beginAtTime');
        const endAt = beginAtMoment.clone().add(duration, 'hours').toDate();
        if (beginAtMoment.isSameOrAfter(endAt)) throw new ValidationError('duration');
        const beginAt = beginAtMoment.toDate();
        await problem.getList(domainId, pids, this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN) || this.user._id, this.user.group, true);
        if (tid) {
            await contest.edit(domainId, tid, {
                title, content, rule, beginAt, endAt, pids, fullScore, rated,
            });
            if (this.tdoc.beginAt !== beginAt || this.tdoc.endAt !== endAt
                || Array.isDiff(this.tdoc.pids, pids) || this.tdoc.rule !== rule ||
                Array.isDiff(this.tdoc.fullScore, fullScore)) {
                await contest.recalcStatus(domainId, this.tdoc.docId);
            }
        } else {
            tid = await contest.add(domainId, title, content, this.user._id, rule, beginAt, endAt, pids, fullScore, rated);
        }
        const task = {
            type: 'schedule', subType: 'contest.problemHide', domainId, tid,
        };
        await TaskModel.deleteMany(task);
        if (Date.now() <= endAt.getTime() && autoHide) {
            // eslint-disable-next-line no-await-in-loop
            await Promise.all(pids.map((pid) => problem.edit(domainId, pid, { hidden: true })));
            await TaskModel.add({
                ...task,
                executeAfter: endAt,
            });
        }
        await contest.edit(domainId, tid, { assign, _code, autoHide });
        this.response.body = { tid };
        this.response.redirect = this.url('contest_detail', { tid });
    }
}

export class ContestCodeHandler extends Handler {
    @param('tid', Types.ObjectID)
    async get(domainId: string, tid: ObjectID) {
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
            for (const pid in tsdoc.detail || {}) {
                rnames[tsdoc.detail[pid].rid] = `U${tsdoc.uid}_P${pid}_R${tsdoc.detail[pid].rid}`;
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
