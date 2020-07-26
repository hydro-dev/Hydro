import yaml from 'js-yaml';
import moment from 'moment-timezone';
import { ObjectID } from 'mongodb';
import AdmZip from 'adm-zip';
import { isSafeInteger } from 'lodash';
import {
    ValidationError, HomeworkNotLiveError, ProblemNotFoundError,
    HomeworkNotAttendedError,
} from '../error';
import { PenaltyRules } from '../interface';
import {
    Route, Handler, Types, param,
} from '../service/server';
import * as bus from '../service/bus';
import { PERM } from '../model/builtin';
import * as system from '../model/system';
import * as user from '../model/user';
import * as contest from '../model/contest';
import * as discussion from '../model/discussion';
import * as problem from '../model/problem';
import * as record from '../model/record';
import * as document from '../model/document';
import paginate from '../lib/paginate';
import { isTitle, isContent } from '../lib/validator';

const validatePenaltyRules = (input: string) => {
    const s = yaml.safeLoad(input);
    return s;
};
const convertPenaltyRules = validatePenaltyRules;

const HomeworkHandler = contest.ContestHandlerMixin(Handler);

class HomeworkMainHandler extends HomeworkHandler {
    async get({ domainId }) {
        const tdocs = await contest.getMulti(domainId, {}, document.TYPE_HOMEWORK).toArray();
        const calendar = [];
        for (const tdoc of tdocs) {
            const cal = { ...tdoc, url: this.url('homework_detail', { tid: tdoc.docId }) };
            if (contest.isExtended(tdoc) || contest.isDone(tdoc)) {
                cal.endAt = tdoc.endAt;
                cal.penaltySince = tdoc.penaltySince;
            } else {
                cal.endAt = tdoc.penaltySince;
            }
            calendar.push(cal);
        }
        const path = [
            ['Hydro', 'homepage'],
            ['homework_main', null],
        ];
        this.response.body = { tdocs, calendar, path };
        this.response.template = 'homework_main.html';
    }
}

class HomeworkDetailHandler extends HomeworkHandler {
    @param('tid', Types.ObjectID)
    @param('page', Types.UnsignedInt, true)
    async get(domainId: string, tid: ObjectID, page = 1) {
        const tdoc = await contest.get(domainId, tid, document.TYPE_HOMEWORK);
        const [tsdoc, pdict] = await Promise.all([
            contest.getStatus(domainId, tdoc.docId, this.user._id, document.TYPE_HOMEWORK),
            problem.getList(domainId, tdoc.pids, true),
        ]);
        const psdict = {};
        let rdict = {};
        let attended = false;
        if (tsdoc) {
            attended = tsdoc.attend === 1;
            for (const pdetail of tsdoc.journal || []) {
                psdict[pdetail.pid] = pdetail;
                rdict[pdetail.rid] = { _id: pdetail.rid };
            }
            if (this.canShowRecord(tdoc) && tsdoc.journal) {
                rdict = await record.getList(
                    domainId,
                    tsdoc.journal.map((pdetail) => pdetail.rid),
                    true,
                );
            }
        }
        // discussion
        const [ddocs, dpcount, dcount] = await paginate(
            discussion.getMulti(domainId, { parentType: tdoc.docType, parentId: tdoc.docId }),
            page,
            await system.get('DISCUSSION_PER_PAGE'),
        );
        const uids = ddocs.map((ddoc) => ddoc.owner);
        uids.push(tdoc.owner);
        const udict = await user.getList(domainId, uids);
        const path = [
            ['Hydro', 'homepage'],
            ['homework_main', 'homework_main'],
            [tdoc.title, null, null, true],
        ];
        this.response.template = 'homework_detail.html';
        this.response.body = {
            tdoc, tsdoc, attended, udict, pdict, psdict, rdict, ddocs, page, dpcount, dcount, path,
        };
    }

    @param('tid', Types.ObjectID)
    async postAttend(domainId: string, tid: ObjectID) {
        this.checkPerm(PERM.PERM_ATTEND_HOMEWORK);
        const tdoc = await contest.get(domainId, tid, document.TYPE_HOMEWORK);
        if (contest.isDone(tdoc)) throw new HomeworkNotLiveError(tdoc.docId);
        await contest.attend(domainId, tdoc.docId, this.user._id, document.TYPE_HOMEWORK);
        this.back();
    }
}

class HomeworkDetailProblemHandler extends HomeworkHandler {
    @param('tid', Types.ObjectID)
    @param('pid', Types.UnsignedInt)
    async prepare(domainId: string, tid: ObjectID, pid: number) {
        this.checkPerm(PERM.PERM_VIEW_PROBLEM);
        [this.tdoc, this.pdoc, this.tsdoc] = await Promise.all([
            contest.get(domainId, tid, document.TYPE_HOMEWORK),
            problem.get(domainId, pid, this.user._id),
            contest.getStatus(domainId, tid, this.user._id, document.TYPE_HOMEWORK),
        ]);
    }

    @param('tid', Types.ObjectID)
    @param('pid', Types.UnsignedInt)
    async get(domainId: string, tid: ObjectID, pid: number) {
        const udoc = await user.getById(domainId, this.tdoc.owner);
        const attended = this.tsdoc && this.tsdoc.attend === 1;
        if (!contest.isDone(this.tdoc)) {
            if (!attended) throw new HomeworkNotAttendedError(tid);
            if (!contest.isOngoing(this.tdoc)) throw new HomeworkNotLiveError(tid);
        }
        if (!this.tdoc.pids.includes(pid)) throw new ProblemNotFoundError(domainId, pid, tid);
        const path = [
            ['Hydro', 'homepage'],
            ['homework_main', 'homework_main'],
            [this.tdoc.title, 'homework_detail', { tid }, true],
            [this.pdoc.title, null, null, true],
        ];
        this.response.template = 'problem_detail.html';
        this.response.body = {
            tdoc: this.tdoc, pdoc: this.pdoc, tsdoc: this.tsdoc, udoc, attended, path,
        };
    }
}

class HomeworkDetailProblemSubmitHandler extends HomeworkDetailProblemHandler {
    @param('tid', Types.ObjectID)
    @param('pid', Types.UnsignedInt)
    async get(domainId: string, tid: ObjectID, pid: number) {
        const udoc = await user.getById(domainId, this.tdoc.owner);
        const attended = this.tsdoc && this.tsdoc.attend === 1;
        if (!attended) throw new HomeworkNotAttendedError(tid);
        if (!contest.isOngoing(this.tdoc)) throw new HomeworkNotLiveError(tid);
        if (!this.tdoc.pids.includes(pid)) throw new ProblemNotFoundError(domainId, pid, tid);
        const rdocs = this.canShowRecord(this.tdoc)
            ? await record.getUserInProblemMulti(domainId, this.user._id, pid, true)
                .sort('_id', -1).limit(10).toArray()
            : [];
        const path = [
            ['Hydro', 'homepage'],
            ['homework_main', 'homework_main'],
            [this.tdoc.title, 'homework_detail', { tid }, true],
            [this.pdoc.title, 'homework_detail_problem', { tid, pid }, true],
            ['homework_detail_problem_submit', null],
        ];
        this.response.template = 'problem_submit.html';
        this.response.body = {
            tdoc: this.tdoc, pdoc: this.pdoc, tsdoc: this.tsdoc, udoc, attended, path, rdocs,
        };
    }

    @param('tid', Types.ObjectID)
    @param('pid', Types.UnsignedInt)
    @param('code', Types.String)
    @param('lang', Types.String)
    async post(domainId: string, tid: ObjectID, pid: number, code: string, lang: string) {
        this.limitRate('add_record', 3600, 100);
        const tsdoc = await contest.getStatus(domainId, tid, this.user._id, document.TYPE_HOMEWORK);
        if (!tsdoc.attend) throw new HomeworkNotAttendedError(tid);
        if (!contest.isOngoing(this.tdoc)) throw new HomeworkNotLiveError(tid);
        if (!this.tdoc.pids.includes(pid)) throw new ProblemNotFoundError(domainId, pid);
        const rid = await record.add(domainId, pid, this.user._id, lang, code, true, {
            type: document.TYPE_HOMEWORK,
            tid,
        });
        const [rdoc] = await Promise.all([
            record.get(domainId, rid),
            contest.updateStatus(domainId, tid, this.user._id,
                rid, pid, false, 0, document.TYPE_HOMEWORK),
        ]);
        bus.publish('record_change', rdoc);
        this.response.body = { tid, rid };
        if (this.canShowRecord(this.tdoc)) this.response.redirect = this.url('record_detail', { rid });
        else this.response.redirect = this.url('homework_detail', { tid });
    }
}

class HomeworkCreateHandler extends HomeworkHandler {
    async get() {
        const beginAt = moment().add(1, 'day');
        console.log(beginAt, beginAt.tz(this.user.timeZone));
        const penaltySince = beginAt.clone().add(7, 'days');
        const path = [
            ['Hydro', 'homepage'],
            ['homework_main', 'homework_main'],
            ['homework_create', null],
        ];
        this.response.template = 'homework_edit.html';
        this.response.body = {
            path,
            dateBeginText: beginAt.tz(this.user.timeZone).format('YYYY-M-D'),
            timeBeginText: '00:00',
            datePenaltyText: penaltySince.tz(this.user.timeZone).format('YYYY-M-D'),
            timePenaltyText: '23:59',
            pids: '1000, 1001',
            extensionDays: 1,
            page_name: 'homework_create',
        };
    }

    @param('beginAtDate', Types.Date)
    @param('beginAtTime', Types.Time)
    @param('penaltySinceDate', Types.Date)
    @param('penaltySinceTime', Types.Time)
    @param('extensionDays', Types.Float)
    @param('penaltyRules', Types.String, validatePenaltyRules, convertPenaltyRules)
    @param('title', Types.String, isTitle)
    @param('content', Types.String, isContent)
    @param('pids', Types.String)
    @param('rated', Types.Boolean)
    async post(
        domainId: string, beginAtDate: string, beginAtTime: string,
        penaltySinceDate: string, penaltySinceTime: string, extensionDays: number,
        penaltyRules: PenaltyRules, title: string, content: string, _pids: string, rated = false,
    ) {
        const pids = _pids.split(',').map((i) => {
            if (isSafeInteger(parseInt(i, 10))) return parseInt(i, 10);
            return i;
        });
        const beginAt = moment.tz(`${beginAtDate} ${beginAtTime}`, this.user.timeZone);
        if (!beginAt.isValid()) throw new ValidationError('beginAtDate', 'beginAtTime');
        const penaltySince = moment.tz(`${penaltySinceDate} ${penaltySinceTime}`, this.user.timeZone);
        if (!penaltySince.isValid()) throw new ValidationError('endAtDate', 'endAtTime');
        const endAt = penaltySince.clone().add(extensionDays, 'days');
        if (beginAt.isSameOrAfter(penaltySince)) throw new ValidationError('endAtDate', 'endAtTime');
        if (penaltySince.isAfter(endAt)) throw new ValidationError('extensionDays');
        await this.verifyProblems(domainId, pids);
        const tid = await contest.add(domainId, title, content, this.user._id,
            'homework', beginAt.toDate(), endAt.toDate(), pids, rated,
            { penaltySince: penaltySince.toDate(), penaltyRules }, document.TYPE_HOMEWORK);
        this.response.body = { tid };
        this.response.redirect = this.url('homework_detail', { tid });
    }
}

class HomeworkEditHandler extends HomeworkHandler {
    @param('tid', Types.ObjectID)
    async get(domainId: string, tid: ObjectID) {
        const tdoc = await contest.get(domainId, tid, document.TYPE_HOMEWORK);
        if (tdoc.owner !== this.user._id) this.checkPerm(PERM.PERM_EDIT_HOMEWORK);
        else this.checkPerm(PERM.PERM_EDIT_HOMEWORK_SELF);
        const extensionDays = Math.round(
            (tdoc.endAt.getTime() - tdoc.penaltySince.getTime()) / 36000 / 24,
        ) / 100;
        const path = [
            ['Hydro', 'homepage'],
            ['homework_main', 'homework_main'],
            [tdoc.title, 'homework_detail', { tid }, true],
            ['homework_edit', null],
        ];
        const beginAt = moment(tdoc.beginAt).tz(this.user.timeZone);
        const penaltySince = moment(tdoc.penaltySince).tz(this.user.timeZone);
        this.response.template = 'homework_edit.html';
        this.response.body = {
            tdoc,
            dateBeginText: beginAt.format('YYYY-M-D'),
            timeBeginText: beginAt.format('hh:mm'),
            datePenaltyText: penaltySince.format('YYYY-M-D'),
            timePenaltyText: penaltySince.format('hh:mm'),
            extensionDays,
            penaltyRules: yaml.safeDump(tdoc.penaltyRules),
            pids: tdoc.pids.join(','),
            path,
        };
    }

    @param('tid', Types.ObjectID)
    @param('beginAtDate', Types.Date)
    @param('beginAtTime', Types.Time)
    @param('penaltySinceDate', Types.Date)
    @param('penaltySinceTime', Types.Time)
    @param('extensionDays', Types.Float)
    @param('penaltyRules', Types.String, validatePenaltyRules, convertPenaltyRules)
    @param('title', Types.String, isTitle)
    @param('content', Types.String, isContent)
    @param('pids', Types.String)
    @param('rated', Types.Boolean)
    async post(
        domainId: string, tid: ObjectID, beginAtDate: string, beginAtTime: string,
        penaltySinceDate: string, penaltySinceTime: string, extensionDays: number,
        penaltyRules: string, title: string, content: string, _pids: string, rated = false,
    ) {
        const pids = _pids.split(',').map((i) => {
            if (isSafeInteger(parseInt(i, 10))) return parseInt(i, 10);
            return i;
        });
        const tdoc = await contest.get(domainId, tid, document.TYPE_HOMEWORK);
        if (tdoc.owner !== this.user._id) this.checkPerm(PERM.PERM_EDIT_HOMEWORK);
        else this.checkPerm(PERM.PERM_EDIT_HOMEWORK_SELF);
        let beginAt;
        let penaltySince;
        try {
            beginAt = moment.tz(`${beginAtDate} ${beginAtTime}`, this.user.timeZone);
        } catch (e) {
            throw new ValidationError('beginAtDate', 'beginAtTime');
        }
        try {
            penaltySince = moment.tz(`${penaltySinceDate} ${penaltySinceTime}`, this.user.timeZone);
        } catch (e) {
            throw new ValidationError('endAtDate', 'endAtTime');
        }
        let endAt = penaltySince.clone().add(extensionDays, 'days');
        if (beginAt.isSameOrAfter(penaltySince)) throw new ValidationError('endAtDate', 'endAtTime');
        await this.verifyProblems(domainId, pids);
        beginAt = beginAt.toDate();
        endAt = endAt.toDate();
        penaltySince = penaltySince.toDate();
        await contest.edit(domainId, tid, {
            title, content, beginAt, endAt, pids, penaltySince, penaltyRules, rated,
        }, document.TYPE_HOMEWORK);
        if (tdoc.beginAt !== beginAt
            || tdoc.endAt !== endAt
            || tdoc.penaltySince !== penaltySince
            || new Set(tdoc.pids) !== new Set(pids)) {
            await contest.recalcStatus(domainId, tdoc.docId, document.TYPE_HOMEWORK);
        }
        this.response.body = { tid };
        this.response.redirect = this.url('homework_detail', { tid });
    }
}

class HomeworkScoreboardHandler extends HomeworkHandler {
    @param('tid', Types.ObjectID)
    async get(domainId: string, tid: ObjectID) {
        console.log(123);
        const [tdoc, rows, udict] = await this.getScoreboard(
            domainId, tid, false, document.TYPE_HOMEWORK,
        );
        const path = [
            ['Hydro', 'homepage'],
            ['homework_main', 'homework_main'],
            [tdoc.title, 'homework_detail', { tid }, true],
            ['homework_scoreboard', null],
        ];
        this.response.template = 'contest_scoreboard.html';
        this.response.body = {
            tdoc, rows, path, udict,
        };
    }
}

class HomeworkScoreboardDownloadHandler extends HomeworkHandler {
    @param('tid', Types.ObjectID)
    @param('ext', Types.String)
    async get(domainId: string, tid: ObjectID, ext: string) {
        const getContent = {
            csv: (rows) => `\uFEFF${rows.map((c) => (c.map((i) => i.value).join(','))).join('\n')}`,
            html: (rows) => this.renderHTML('contest_scoreboard_download_html.html', { rows }),
        };
        if (!getContent[ext]) throw new ValidationError('ext');
        const [, rows] = await this.getScoreboard(domainId, tid, true, document.TYPE_CONTEST);
        this.binary(await getContent[ext](rows), `${this.tdoc.title}.${ext}`);
    }
}

class HomeworkCodeHandler extends HomeworkHandler {
    @param('tid', Types.ObjectID)
    async get(domainId: string, tid: ObjectID) {
        this.checkPerm(PERM.PERM_READ_RECORD_CODE);
        this.limitRate('homework_code', 3600, 60);
        const [tdoc, tsdocs] = await contest.getAndListStatus(
            domainId, tid, document.TYPE_HOMEWORK,
        );
        const rnames = {};
        for (const tsdoc of tsdocs) {
            for (const pdetail of tsdoc.detail || []) {
                rnames[pdetail.rid] = `U${tsdoc.uid}_P${pdetail.pid}_R${pdetail.rid}`;
            }
        }
        const zip = new AdmZip();
        const rdocs = await record.getMulti(domainId, {
            _id: {
                $in: Array.from(Object.keys(rnames)).map((id) => new ObjectID(id)),
            },
        }).toArray();
        for (const rdoc of rdocs) {
            zip.addFile(`${rnames[rdoc._id]}.${rdoc.lang}`, rdoc.code);
        }
        await this.binary(zip.toBuffer(), `${tdoc.title}.zip`);
    }
}

export async function apply() {
    Route('homework_main', '/homework', HomeworkMainHandler, PERM.PERM_VIEW_HOMEWORK);
    Route('homework_create', '/homework/create', HomeworkCreateHandler, PERM.PERM_CREATE_HOMEWORK);
    Route('homework_detail', '/homework/:tid', HomeworkDetailHandler, PERM.PERM_VIEW_HOMEWORK);
    Route('homework_scoreboard', '/homework/:tid/scoreboard', HomeworkScoreboardHandler, PERM.PERM_VIEW_HOMEWORK_SCOREBOARD);
    Route('homework_scoreboard', '/homework/:tid/scoreboard/download/:ext', HomeworkScoreboardDownloadHandler, PERM.PERM_VIEW_HOMEWORK_SCOREBOARD);
    Route('homework_detail_problem', '/homework/:tid/p/:pid', HomeworkDetailProblemHandler, PERM.PERM_VIEW_HOMEWORK);
    Route('homework_detail_problem_submit', '/homework/:tid/p/:pid/submit', HomeworkDetailProblemSubmitHandler, PERM.PERM_SUBMIT_PROBLEM);
    Route('homework_code', '/homework/:tid/code', HomeworkCodeHandler, PERM.PERM_VIEW_HOMEWORK);
    Route('homework_edit', '/homework/:tid/edit', HomeworkEditHandler);
}

global.Hydro.handler.homework = apply;
