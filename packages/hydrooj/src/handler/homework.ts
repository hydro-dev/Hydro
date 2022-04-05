import AdmZip from 'adm-zip';
import yaml from 'js-yaml';
import moment from 'moment-timezone';
import { ObjectID } from 'mongodb';
import { Time } from '@hydrooj/utils/lib/utils';
import {
    ContestNotFoundError, ForbiddenError, HomeworkNotLiveError,
    ValidationError,
} from '../error';
import { PenaltyRules } from '../interface';
import paginate from '../lib/paginate';
import { PERM, PRIV } from '../model/builtin';
import * as contest from '../model/contest';
import * as discussion from '../model/discussion';
import problem from '../model/problem';
import record from '../model/record';
import * as system from '../model/system';
import user from '../model/user';
import {
    Handler, param, Route, Types,
} from '../service/server';

const validatePenaltyRules = (input: string) => yaml.load(input);
const convertPenaltyRules = validatePenaltyRules;

class HomeworkMainHandler extends Handler {
    async get({ domainId }) {
        const tdocs = await contest.getMulti(domainId, { rule: 'homework' }).toArray();
        const calendar = [];
        for (const tdoc of tdocs) {
            const cal = { ...tdoc, url: this.url('homework_detail', { tid: tdoc.docId }) };
            if (contest.isExtended(tdoc) || contest.isDone(tdoc)) {
                cal.endAt = tdoc.endAt;
                cal.penaltySince = tdoc.penaltySince;
            } else cal.endAt = tdoc.penaltySince;
            calendar.push(cal);
        }
        this.response.body = { tdocs, calendar };
        this.response.template = 'homework_main.html';
    }
}

class HomeworkDetailHandler extends Handler {
    @param('tid', Types.ObjectID)
    async prepare(domainId: string, tid: ObjectID) {
        const tdoc = await contest.get(domainId, tid);
        if (tdoc.rule !== 'homework') throw new ContestNotFoundError(domainId, tid);
        if (tdoc.assign?.length) {
            if (!Set.intersection(tdoc.assign, this.user.group).size) {
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
        if (tdoc.rule !== 'homework') throw new ContestNotFoundError(domainId, tid);
        // discussion
        const [ddocs, dpcount, dcount] = await paginate(
            discussion.getMulti(domainId, { parentType: tdoc.docType, parentId: tdoc.docId }),
            page,
            system.get('pagination.discussion'),
        );
        const uids = ddocs.map((ddoc) => ddoc.owner);
        uids.push(tdoc.owner);
        const udict = await user.getList(domainId, uids);
        this.response.template = 'homework_detail.html';
        this.response.body = {
            tdoc, tsdoc, udict, ddocs, page, dpcount, dcount,
        };
        if (contest.isNotStarted(tdoc)) return;
        const pdict = await problem.getList(domainId, tdoc.pids, true, undefined, undefined, problem.PROJECTION_CONTEST_LIST);
        const psdict = {};
        let rdict = {};
        if (tsdoc) {
            for (const pdetail of tsdoc.journal || []) {
                psdict[pdetail.pid] = pdetail;
                rdict[pdetail.rid] = { _id: pdetail.rid };
            }
            if (contest.canShowSelfRecord.call(this, tdoc) && tsdoc.journal) {
                rdict = await record.getList(
                    domainId,
                    tsdoc.journal.map((pdetail) => pdetail.rid),
                );
            }
        }
        this.response.body.pdict = pdict;
        this.response.body.psdict = psdict;
        this.response.body.rdict = rdict;
    }

    @param('tid', Types.ObjectID)
    async postAttend(domainId: string, tid: ObjectID) {
        this.checkPerm(PERM.PERM_ATTEND_HOMEWORK);
        const tdoc = await contest.get(domainId, tid);
        if (contest.isDone(tdoc)) throw new HomeworkNotLiveError(tdoc.docId);
        await contest.attend(domainId, tdoc.docId, this.user._id);
        this.back();
    }

    @param('tid', Types.ObjectID)
    async postDelete(domainId: string, tid: ObjectID) {
        const tdoc = await contest.get(domainId, tid);
        if (!this.user.own(tdoc)) this.checkPerm(PERM.PERM_EDIT_HOMEWORK);
        await contest.del(domainId, tid);
        this.response.redirect = this.url('homework_main');
    }
}

class HomeworkEditHandler extends Handler {
    @param('tid', Types.ObjectID, true)
    async get(domainId: string, tid: ObjectID) {
        const tdoc = tid ? await contest.get(domainId, tid) : null;
        if (!tid) this.checkPerm(PERM.PERM_CREATE_HOMEWORK);
        else if (!this.user.own(tdoc)) this.checkPerm(PERM.PERM_EDIT_HOMEWORK);
        else this.checkPerm(PERM.PERM_EDIT_HOMEWORK_SELF);
        const extensionDays = tid
            ? Math.round(
                (tdoc.endAt.getTime() - tdoc.penaltySince.getTime()) / (Time.day / 100),
            ) / 100
            : 1;
        const beginAt = tid
            ? moment(tdoc.beginAt).tz(this.user.timeZone)
            : moment().add(1, 'day').tz(this.user.timeZone).hour(0).minute(0).millisecond(0);
        const penaltySince = tid
            ? moment(tdoc.penaltySince).tz(this.user.timeZone)
            : beginAt.clone().add(7, 'days').tz(this.user.timeZone).hour(23).minute(59).millisecond(0);
        this.response.template = 'homework_edit.html';
        this.response.body = {
            tdoc,
            dateBeginText: beginAt.format('YYYY-M-D'),
            timeBeginText: beginAt.format('hh:mm'),
            datePenaltyText: penaltySince.format('YYYY-M-D'),
            timePenaltyText: penaltySince.format('hh:mm'),
            extensionDays,
            penaltyRules: tid ? yaml.dump(tdoc.penaltyRules) : null,
            pids: tid ? tdoc.pids.join(',') : '',
            page_name: tid ? 'homework_edit' : 'homework_create',
        };
    }

    @param('tid', Types.ObjectID, true)
    @param('beginAtDate', Types.Date)
    @param('beginAtTime', Types.Time)
    @param('penaltySinceDate', Types.Date)
    @param('penaltySinceTime', Types.Time)
    @param('extensionDays', Types.Float)
    @param('penaltyRules', Types.Content, validatePenaltyRules, convertPenaltyRules)
    @param('title', Types.Title)
    @param('content', Types.Content)
    @param('pids', Types.Content)
    @param('rated', Types.Boolean)
    @param('assign', Types.CommaSeperatedArray, true)
    async post(
        domainId: string, tid: ObjectID, beginAtDate: string, beginAtTime: string,
        penaltySinceDate: string, penaltySinceTime: string, extensionDays: number,
        penaltyRules: PenaltyRules, title: string, content: string, _pids: string, rated = false,
        assign: string[] = [],
    ) {
        const pids = _pids.replace(/，/g, ',').split(',').map((i) => +i).filter((i) => i);
        const tdoc = tid ? await contest.get(domainId, tid) : null;
        if (!tid) this.checkPerm(PERM.PERM_CREATE_HOMEWORK);
        else if (!this.user.own(tdoc)) this.checkPerm(PERM.PERM_EDIT_HOMEWORK);
        else this.checkPerm(PERM.PERM_EDIT_HOMEWORK_SELF);
        const beginAt = moment.tz(`${beginAtDate} ${beginAtTime}`, this.user.timeZone);
        if (!beginAt.isValid()) throw new ValidationError('beginAtDate', 'beginAtTime');
        const penaltySince = moment.tz(`${penaltySinceDate} ${penaltySinceTime}`, this.user.timeZone);
        if (!penaltySince.isValid()) throw new ValidationError('endAtDate', 'endAtTime');
        const endAt = penaltySince.clone().add(extensionDays, 'days');
        if (beginAt.isSameOrAfter(penaltySince)) throw new ValidationError('endAtDate', 'endAtTime');
        if (penaltySince.isAfter(endAt)) throw new ValidationError('extensionDays');
        await problem.getList(domainId, pids, this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN) || this.user._id, this.user.group, true);
        if (!tid) {
            tid = await contest.add(domainId, title, content, this.user._id,
                'homework', beginAt.toDate(), endAt.toDate(), pids, rated,
                { penaltySince: penaltySince.toDate(), penaltyRules, assign });
        } else {
            await contest.edit(domainId, tid, {
                title,
                content,
                beginAt: beginAt.toDate(),
                endAt: endAt.toDate(),
                pids,
                penaltySince: penaltySince.toDate(),
                penaltyRules,
                rated,
                assign,
            });
            if (tdoc.beginAt !== beginAt.toDate()
                || tdoc.endAt !== endAt.toDate()
                || tdoc.penaltySince !== penaltySince.toDate()
                || tdoc.pids.sort().join(' ') !== pids.sort().join(' ')) {
                await contest.recalcStatus(domainId, tdoc.docId);
            }
        }
        this.response.body = { tid };
        this.response.redirect = this.url('homework_detail', { tid });
    }
}

class HomeworkScoreboardHandler extends Handler {
    @param('tid', Types.ObjectID)
    @param('page', Types.PositiveInt, true)
    async get(domainId: string, tid: ObjectID, page = 1) {
        const [tdoc, rows, udict, , nPages] = await contest.getScoreboard.call(
            this, domainId, tid, false, page,
        );
        const pdict = await problem.getList(domainId, tdoc.pids, true, undefined, false, [
            // Problem statistics display is allowed as we can view submission info in scoreboard.
            ...problem.PROJECTION_CONTEST_LIST, 'nSubmit', 'nAccept',
        ]);
        const path = [
            ['Hydro', 'homepage'],
            ['homework_main', 'homework_main'],
            [tdoc.title, 'homework_detail', { tid }, true],
            ['homework_scoreboard', null],
        ];
        this.response.template = 'contest_scoreboard.html';
        this.response.body = {
            tdoc, rows, path, udict, pdict, page, nPages, page_name: 'homework_scoreboard',
        };
    }
}

class HomeworkScoreboardDownloadHandler extends Handler {
    @param('tid', Types.ObjectID)
    @param('ext', Types.Name)
    async get(domainId: string, tid: ObjectID, ext: string) {
        await this.limitRate('scoreboard_download', 120, 3);
        const getContent = {
            csv: (rows) => `\uFEFF${rows.map((c) => (c.map((i) => i.value).join(','))).join('\n')}`,
            html: (rows) => this.renderHTML('contest_scoreboard_download_html.html', { rows }),
        };
        if (!getContent[ext]) throw new ValidationError('ext', null, 'Unknown file extension');
        const [tdoc, rows] = await contest.getScoreboard.call(this, domainId, tid, true, 0);
        this.binary(await getContent[ext](rows), `${tdoc.title}.${ext}`);
    }
}

class HomeworkCodeHandler extends Handler {
    @param('tid', Types.ObjectID)
    async get(domainId: string, tid: ObjectID) {
        await this.limitRate('contest_code', 3600, 60);
        const [tdoc, tsdocs] = await contest.getAndListStatus(domainId, tid);
        if (!this.user.own(tdoc) && !this.user.hasPriv(PRIV.PRIV_READ_RECORD_CODE)) {
            this.checkPerm(PERM.PERM_READ_RECORD_CODE);
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
    Route('homework_main', '/homework', HomeworkMainHandler, PERM.PERM_VIEW_HOMEWORK);
    Route('homework_create', '/homework/create', HomeworkEditHandler);
    Route('homework_detail', '/homework/:tid', HomeworkDetailHandler, PERM.PERM_VIEW_HOMEWORK);
    Route('homework_scoreboard', '/homework/:tid/scoreboard', HomeworkScoreboardHandler, PERM.PERM_VIEW_HOMEWORK_SCOREBOARD);
    Route(
        'homework_scoreboard_download', '/homework/:tid/scoreboard/download/:ext',
        HomeworkScoreboardDownloadHandler, PERM.PERM_VIEW_HOMEWORK_SCOREBOARD,
    );
    Route('homework_code', '/homework/:tid/code', HomeworkCodeHandler, PERM.PERM_VIEW_HOMEWORK);
    Route('homework_edit', '/homework/:tid/edit', HomeworkEditHandler);
}

global.Hydro.handler.homework = apply;
