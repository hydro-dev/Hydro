import { Readable } from 'stream';
import { BlobWriter, TextReader, ZipWriter } from '@zip.js/zip.js';
import { stringify as toCSV } from 'csv-stringify/sync';
import { readFile } from 'fs-extra';
import { escapeRegExp, pick } from 'lodash';
import moment from 'moment-timezone';
import { ObjectId } from 'mongodb';
import {
    Counter, diffArray, getAlphabeticId, randomstring, sortFiles, Time, yaml,
} from '@hydrooj/utils/lib/utils';
import { Context, Service } from '../context';
import {
    BadRequestError, ContestNotAttendedError, ContestNotEndedError, ContestNotFoundError, ContestNotLiveError,
    ContestScoreboardHiddenError, FileLimitExceededError, FileUploadError,
    InvalidTokenError, MethodNotAllowedError, NotAssignedError, NotFoundError, PermissionError, ValidationError,
} from '../error';
import { FileInfo, ScoreboardConfig, Tdoc } from '../interface';
import { PERM, PRIV, STATUS } from '../model/builtin';
import * as contest from '../model/contest';
import * as discussion from '../model/discussion';
import * as document from '../model/document';
import message from '../model/message';
import * as oplog from '../model/oplog';
import problem from '../model/problem';
import record from '../model/record';
import ScheduleModel from '../model/schedule';
import storage from '../model/storage';
import user from '../model/user';
import {
    Handler, param, post, Type, Types,
} from '../service/server';

export class ContestListHandler extends Handler {
    @param('rule', Types.Range(contest.RULES), true)
    @param('group', Types.Name, true)
    @param('page', Types.PositiveInt, true)
    @param('q', Types.String, true)
    async get(domainId: string, rule = '', group = '', page = 1, q = '') {
        if (rule && contest.RULES[rule].hidden) throw new BadRequestError();
        const groups = (await user.listGroup(domainId, this.user.hasPerm(PERM.PERM_VIEW_HIDDEN_CONTEST) ? undefined : this.user._id))
            .map((i) => i.name);
        if (group && !groups.includes(group)) throw new NotAssignedError(group);
        const rules = Object.keys(contest.RULES).filter((i) => !contest.RULES[i].hidden);
        const escaped = escapeRegExp(q.toLowerCase());
        const $regex = new RegExp(q.length >= 2 ? escaped : `\\A${escaped}`, 'gim');
        const filter = {
            ...(this.user.hasPerm(PERM.PERM_VIEW_HIDDEN_CONTEST) && !group)
                ? {}
                : {
                    $or: [
                        { maintainer: this.user._id },
                        { owner: this.user._id },
                        { assign: { $in: groups } },
                        { assign: { $size: 0 } },
                    ],
                },
            ...rule ? { rule } : { rule: { $in: rules } },
            ...group ? { assign: { $in: [group] } } : {},
            ...q ? { title: { $regex } } : {},
        };
        await this.ctx.parallel('contest/list', filter, this);
        const cursor = contest.getMulti(domainId, filter).sort({ endAt: -1, beginAt: -1, _id: -1 });
        let qs = rule ? `rule=${rule}` : '';
        if (group) qs += qs ? `&group=${group}` : `group=${group}`;
        if (q) qs += `${qs ? '&' : ''}q=${encodeURIComponent(q)}`;
        const [tdocs, tpcount] = await this.paginate(cursor, page, 'contest');
        const tids = [];
        for (const tdoc of tdocs) tids.push(tdoc.docId);
        const tsdict = await contest.getListStatus(domainId, this.user._id, tids);
        const groupsFilter = groups.filter((i) => !Number.isSafeInteger(+i));
        this.response.template = 'contest_main.html';
        this.response.body = {
            page, tpcount, qs, rule, tdocs, tsdict, groups: groupsFilter, group, q,
        };
    }
}

export class ContestDetailBaseHandler extends Handler {
    tdoc?: Tdoc;
    tsdoc?: any;

    @param('tid', Types.ObjectId, true)
    async __prepare(domainId: string, tid: ObjectId) {
        if (!tid) return; // ProblemDetailHandler also extends from ContestDetailBaseHandler
        [this.tdoc, this.tsdoc] = await Promise.all([
            contest.get(domainId, tid),
            contest.getStatus(domainId, tid, this.user._id),
        ]);
        if (this.tdoc.assign?.length && !this.user.own(this.tdoc) && !this.user.hasPerm(PERM.PERM_VIEW_HIDDEN_CONTEST)) {
            const groups = await user.listGroup(domainId, this.user._id);
            if (!Set.intersection(this.tdoc.assign, groups.map((i) => i.name)).size) {
                throw new NotAssignedError('contest', tid);
            }
        }
        if (this.tdoc.duration && this.tsdoc?.startAt) {
            const endAt = moment(this.tsdoc.startAt).add(this.tdoc.duration, 'hours').toDate();
            this.tsdoc.endAt = endAt < this.tdoc.endAt ? endAt : this.tdoc.endAt;
        }
    }

    tsdocAsPublic() {
        if (!this.tsdoc) return null;
        return pick(this.tsdoc, ['attend', 'subscribe', 'startAt', ...(this.tdoc.duration ? ['endAt'] : [])]);
    }

    @param('tid', Types.ObjectId, true)
    async after(domainId: string, tid: ObjectId) {
        if (!tid || this.tdoc.rule === 'homework') return;
        if (this.request.json || !this.response.template) return;
        const pdoc = 'pdoc' in this ? (this as any).pdoc : {};
        this.response.body.overrideNav = [
            {
                name: 'contest_main',
                args: {},
                displayName: 'Back to contest list',
                checker: () => true,
            },
            {
                name: 'contest_detail',
                displayName: this.tdoc.title,
                args: { tid, prefix: 'contest_detail' },
                checker: () => true,
            },
            {
                name: 'contest_problemlist',
                args: { tid, prefix: 'contest_problemlist' },
                checker: () => this.tsdoc?.attend || contest.isDone(this.tdoc),
            },
            {
                name: 'contest_print',
                args: { tid, prefix: 'contest_print' },
                checker: () => this.tdoc.allowPrint && (this.tsdoc?.attend || this.user.own(this.tdoc) || this.user.hasPerm(PERM.PERM_EDIT_CONTEST)),
            },
            {
                name: 'contest_scoreboard',
                args: { tid, prefix: 'contest_scoreboard' },
                checker: () => contest.canShowScoreboard.call(this, this.tdoc, true),
            },
            {
                name: 'problem_detail',
                displayName: `${getAlphabeticId(this.tdoc.pids.indexOf(pdoc.docId))}. ${pdoc.title}`,
                args: { query: { tid }, pid: pdoc.docId, prefix: 'contest_detail_problem' },
                checker: () => 'pdoc' in this,
            },
        ];
    }
}

export class ContestDetailHandler extends ContestDetailBaseHandler {
    @param('tid', Types.ObjectId)
    async prepare(domainId: string, tid: ObjectId) {
        if (contest.RULES[this.tdoc.rule].hidden) throw new ContestNotFoundError(domainId, tid);
    }

    @param('tid', Types.ObjectId)
    async get(domainId: string, tid: ObjectId) {
        this.response.template = 'contest_detail.html';
        const udict = await user.getList(domainId, [this.tdoc.owner]);
        this.response.body = {
            tdoc: this.tdoc,
            tsdoc: this.tsdocAsPublic(),
            udict,
            files: (this.tsdoc?.attend && !contest.isNotStarted(this.tdoc)) ? sortFiles(this.tdoc.privateFiles || []) : [],
            urlForFile: (filename: string) => this.url('contest_file_download', { tid, filename, type: 'private' }),
        };
        if (this.request.json) return;
        this.response.body.tdoc.content = this.response.body.tdoc.content
            .replace(/\(file:\/\//g, `(./${this.tdoc.docId}/file/public/`)
            .replace(/="file:\/\//g, `="./${this.tdoc.docId}/file/public/`);
    }

    @param('tid', Types.ObjectId)
    @param('code', Types.String, true)
    async postAttend(domainId: string, tid: ObjectId, code = '') {
        this.checkPerm(PERM.PERM_ATTEND_CONTEST);
        if (contest.isDone(this.tdoc)) throw new ContestNotLiveError(tid);
        if (this.tdoc._code && code !== this.tdoc._code) throw new InvalidTokenError('Contest Invitation', code);
        await contest.attend(domainId, tid, this.user._id, { subscribe: 1 });
        this.back();
    }

    @param('tid', Types.ObjectId)
    @param('subscribe', Types.Boolean)
    async postSubscribe(domainId: string, tid: ObjectId, subscribe = false) {
        if (!this.tsdoc?.attend) throw new ContestNotAttendedError(domainId, tid);
        await contest.setStatus(domainId, tid, this.user._id, { subscribe: subscribe ? 1 : 0 });
        this.back();
    }
}

export class ContestPrintHandler extends ContestDetailBaseHandler {
    @param('tid', Types.ObjectId)
    async prepare({ domainId }, tid: ObjectId) {
        if (!this.tdoc?.allowPrint) throw new NotFoundError();
        if (!this.user.own(this.tdoc) && !this.user.hasPerm(PERM.PERM_EDIT_CONTEST) && !this.tsdoc?.attend) {
            throw new ContestNotAttendedError(domainId, tid);
        }
    }

    async get() {
        this.response.body = { tdoc: this.tdoc };
        this.response.template = 'contest_print.html';
    }

    async post() {
        if (this.args.operation) return;
        if (this.args.file_contents && this.args.original_name) {
            try {
                await (this.postPrint as any)({
                    ...this.args,
                    title: this.args.original_name,
                    content: Buffer.from(this.args.file_contents, 'base64').toString('utf-8'),
                });
                this.response.body = { success: true, output: '' };
            } catch (e) {
                this.response.body = { success: false, output: e.message };
            } finally {
                delete this.response.redirect;
            }
        } else throw new MethodNotAllowedError('POST');
    }

    @param('tid', Types.ObjectId)
    @param('title', Types.Title, true)
    @param('content', Types.Content, true)
    async postPrint(domainId: string, tid: ObjectId, title = '', content = '') {
        if (!this.tsdoc?.attend) throw new ContestNotAttendedError(domainId, tid);
        if (!contest.isOngoing(this.tdoc, this.tsdoc)) throw new ContestNotLiveError(domainId, tid);
        await this.limitRate('add_print', 3600, 60);
        if (this.request.files?.file) {
            const file = this.request.files.file;
            if (file.size > 1024 * 1024) throw new ValidationError('file');
            content = await readFile(file.filepath, 'utf-8');
            title ||= file.originalFilename || 'file';
        }
        if (!content) throw new ValidationError('content');
        await contest.addPrintTask(domainId, tid, this.user._id, title, content);
        this.back();
    }

    @param('tid', Types.ObjectId)
    async postGetPrintTask(domainId: string, tid: ObjectId) {
        const isContestAdmin = this.user.own(this.tdoc) || this.user.hasPerm(PERM.PERM_EDIT_CONTEST);
        const tasks = await contest.getMultiPrintTask(domainId, tid, isContestAdmin ? {} : { owner: this.user._id })
            .project({ _id: 1, title: 1, owner: 1, status: 1 }).sort({ _id: 1 }).toArray();
        const uids = Array.from(new Set(tasks.map((i) => i.owner)));
        const udict = await user.getListForRender(domainId, uids, this.user.hasPerm(PERM.PERM_VIEW_USER_PRIVATE_INFO));
        this.response.body = { tasks, udict };
    }

    @param('tid', Types.ObjectId)
    async postAllocatePrintTask(domainId: string, tid: ObjectId) {
        if (!this.user.own(this.tdoc) && !this.user.hasPerm(PERM.PERM_EDIT_CONTEST)) {
            throw new PermissionError(PERM.PERM_EDIT_CONTEST);
        }
        const task = await contest.allocatePrintTask(domainId, tid);
        const udoc = task ? await user.getById(domainId, task.owner) : null;
        this.response.body = { task, udoc };
    }

    @param('tid', Types.ObjectId)
    @param('taskId', Types.ObjectId)
    @param('status', Types.Range(['printed', 'pending']))
    async postUpdatePrintTask(domainId: string, tid: ObjectId, taskId: ObjectId, status: 'printed' | 'pending') {
        if (!this.user.own(this.tdoc) && !this.user.hasPerm(PERM.PERM_EDIT_CONTEST)) {
            throw new PermissionError(PERM.PERM_EDIT_CONTEST);
        }
        await contest.updatePrintTask(domainId, tid, taskId, {
            status: status === 'printed' ? contest.PrintTaskStatus.printed : contest.PrintTaskStatus.pending,
        });
        this.response.body = { success: true };
    }
}

export class ContestProblemListHandler extends ContestDetailBaseHandler {
    @param('tid', Types.ObjectId)
    async prepare(domainId: string, tid: ObjectId) {
        if (contest.RULES[this.tdoc.rule].hidden) throw new ContestNotFoundError(domainId, tid);
    }

    @param('tid', Types.ObjectId)
    async get(domainId: string, tid: ObjectId) {
        if (contest.isNotStarted(this.tdoc)) throw new ContestNotLiveError(domainId, tid);
        if (!this.tsdoc?.attend && !contest.isDone(this.tdoc)) throw new ContestNotAttendedError(domainId, tid);
        const [pdict, udict, tcdocs] = await Promise.all([
            problem.getList(domainId, this.tdoc.pids, true, true, problem.PROJECTION_CONTEST_LIST),
            user.getList(domainId, [this.tdoc.owner, this.user._id]),
            contest.getMultiClarification(domainId, tid, this.user._id),
        ]);
        this.response.body = {
            pdict, psdict: {}, udict, rdict: {}, tdoc: this.tdoc, tcdocs,
        };
        this.response.template = 'contest_problemlist.html';
        this.response.body.showScore = Object.values(this.tdoc.score || {}).some((i) => i && i !== 100);
        if (!this.tsdoc) return;
        if (this.tsdoc.attend && !this.tsdoc.startAt && contest.isOngoing(this.tdoc)) {
            await contest.setStatus(domainId, tid, this.user._id, { startAt: new Date() });
            this.tsdoc.startAt = new Date();
        }
        this.response.body.tsdoc = this.tsdocAsPublic();
        this.response.body.psdict = this.tsdoc.detail || {};
        const psdocs: any[] = Object.values(this.response.body.psdict);
        const canViewRecord = contest.canShowSelfRecord.call(this, this.tdoc);
        this.response.body.canViewRecord = canViewRecord;
        const rids = psdocs.map((i) => i.rid);
        if (contest.isDone(this.tdoc) && canViewRecord) {
            const correction = await problem.getListStatus(domainId, this.user._id, this.tdoc.pids);
            for (const pid in correction) {
                if (this.tsdoc.detail?.[pid]?.rid === correction[pid].rid) delete correction[pid];
            }
            rids.push(...Object.values(correction).map((i) => i.rid));
            this.response.body.correction = correction;
        }
        [this.response.body.rdict, this.response.body.rdocs] = canViewRecord
            ? await Promise.all([
                record.getList(domainId, rids),
                record.getMulti(domainId, { contest: tid, uid: this.user._id })
                    .sort({ _id: -1 }).toArray(),
            ])
            : [Object.fromEntries(psdocs.map((i) => [i.rid, { _id: i.rid }])), []];
        if (!this.user.own(this.tdoc) && !this.user.hasPerm(PERM.PERM_EDIT_CONTEST)) {
            this.response.body.rdocs = this.response.body.rdocs.map((rdoc) => contest.applyProjection(this.tdoc, rdoc, this.user));
            for (const key in this.response.body.rdict) {
                this.response.body.rdict[key] = contest.applyProjection(this.tdoc, this.response.body.rdict[key], this.user);
            }
            for (const key in this.response.body.psdict) {
                this.response.body.psdict[key] = contest.applyProjection(this.tdoc, this.response.body.psdict[key], this.user);
            }
        }
    }

    @param('tid', Types.ObjectId)
    @param('content', Types.Content)
    @param('subject', Types.Int)
    async postClarification(domainId: string, tid: ObjectId, content: string, subject: number) {
        if (!this.tsdoc?.attend) throw new ContestNotAttendedError(domainId, tid);
        if (!contest.isOngoing(this.tdoc)) throw new ContestNotLiveError(domainId, tid);
        await this.limitRate('add_discussion', 3600, 60);
        await contest.addClarification(domainId, tid, this.user._id, content, this.request.ip, subject);
        if (!this.user.own(this.tdoc)) {
            await message.send(1, (this.tdoc.maintainer || []).concat(this.tdoc.owner), JSON.stringify({
                message: 'Contest {0} has a new clarification about {1}, please go to contest clarifications page to reply.',
                params: [this.tdoc.title, subject > 0 ? `#${this.tdoc.pids.indexOf(subject) + 1}` : 'the contest'],
                url: this.url('contest_clarification', { tid }),
            }), message.FLAG_I18N | message.FLAG_UNREAD);
        }
        this.back();
    }
}

export class ContestEditHandler extends Handler {
    tdoc: Tdoc;

    @param('tid', Types.ObjectId, true)
    async prepare(domainId: string, tid: ObjectId) {
        if (tid) {
            this.tdoc = await contest.get(domainId, tid);
            if (!this.tdoc) throw new ContestNotFoundError(domainId, tid);
            if (contest.RULES[this.tdoc.rule].hidden) throw new ContestNotFoundError(domainId, tid);
            if (!this.user.own(this.tdoc)) this.checkPerm(PERM.PERM_EDIT_CONTEST);
            else this.checkPerm(PERM.PERM_EDIT_CONTEST_SELF);
        } else this.checkPerm(PERM.PERM_CREATE_CONTEST);
    }

    @param('tid', Types.ObjectId, true)
    async get(domainId: string, tid: ObjectId) {
        this.response.template = 'contest_edit.html';
        const rules = {};
        for (const i in contest.RULES) {
            if (!contest.RULES[i].hidden) {
                rules[i] = contest.RULES[i].TEXT;
            }
        }
        let ts = Date.now();
        ts = ts - (ts % (15 * Time.minute)) + 15 * Time.minute;
        const beginAt = moment(this.tdoc?.beginAt || new Date(ts)).tz(this.user.timeZone);
        this.response.body = {
            rules,
            tdoc: this.tdoc,
            duration: tid ? -beginAt.diff(this.tdoc.endAt, 'hour', true) : 2,
            pids: tid ? this.tdoc.pids.join(',') : '',
            beginAt,
            page_name: tid ? 'contest_edit' : 'contest_create',
            files: tid ? this.tdoc.files : [],
            urlForFile: (filename: string) => this.url('contest_file_download', { tid, filename, type: 'public' }),
        };
    }

    @param('tid', Types.ObjectId, true)
    @param('beginAtDate', Types.Date)
    @param('beginAtTime', Types.Time)
    @param('duration', Types.Float)
    @param('title', Types.Title)
    @param('content', Types.Content)
    @param('rule', Types.String)
    @param('pids', Types.Content)
    @param('rated', Types.Boolean)
    @param('code', Types.String, true)
    @param('autoHide', Types.Boolean)
    @param('assign', Types.CommaSeperatedArray, true)
    @param('lock', Types.UnsignedInt, true)
    @param('contestDuration', Types.Float, true)
    @param('maintainer', Types.NumericArray, true)
    @param('allowViewCode', Types.Boolean)
    @param('allowPrint', Types.Boolean)
    @param('langs', Types.CommaSeperatedArray, true)
    async postUpdate(
        domainId: string, tid: ObjectId, beginAtDate: string, beginAtTime: string, duration: number,
        title: string, content: string, rule: string, _pids: string, rated = false,
        _code = '', autoHide = false, assign: string[] = [], lock: number = null,
        contestDuration: number = null, maintainer: number[] = [], allowViewCode = false, allowPrint = false, langs: string[] = [],
    ) {
        if (!Object.keys(contest.RULES).includes(rule) || contest.RULES[rule].hidden) throw new ValidationError('rule');
        if (autoHide) this.checkPerm(PERM.PERM_EDIT_PROBLEM);
        const pids = _pids.replace(/，/g, ',').split(',').map((i) => +i).filter((i) => i);
        const beginAtMoment = moment.tz(`${beginAtDate} ${beginAtTime}`, this.user.timeZone);
        if (!beginAtMoment.isValid()) throw new ValidationError('beginAtDate', 'beginAtTime');
        const endAt = beginAtMoment.clone().add(duration, 'hours').toDate();
        if (beginAtMoment.isSameOrAfter(endAt)) throw new ValidationError('duration');
        const beginAt = beginAtMoment.toDate();
        const lockAt = lock ? moment(endAt).add(-lock, 'minutes').toDate() : null;
        if (lockAt && contestDuration) throw new ValidationError('lockAt', 'duration');
        await problem.getList(domainId, pids, this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN) || this.user._id, true);
        if (tid) {
            await contest.edit(domainId, tid, {
                title, content, rule, beginAt, endAt, pids, rated, duration: contestDuration,
            });
            if (this.tdoc.beginAt !== beginAt || this.tdoc.endAt !== endAt
                || diffArray(this.tdoc.pids, pids) || this.tdoc.rule !== rule
                || lockAt !== this.tdoc.lockAt) {
                await contest.recalcStatus(domainId, this.tdoc.docId);
            }
        } else {
            tid = await contest.add(domainId, title, content, this.user._id, rule, beginAt, endAt, pids, rated, { duration: contestDuration });
        }
        const task = {
            type: 'schedule', subType: 'contest', domainId, tid,
        };
        await ScheduleModel.deleteMany(task);
        const operation = [];
        if (Date.now() <= endAt.getTime() && autoHide) {
            await Promise.all(pids.map((pid) => problem.edit(domainId, pid, { hidden: true })));
            operation.push('unhide');
        }
        if (operation.length) {
            await ScheduleModel.add({
                ...task,
                operation,
                executeAfter: endAt,
            });
        }
        await contest.edit(domainId, tid, {
            assign, _code, autoHide, lockAt, maintainer, allowViewCode, allowPrint, langs,
        });
        this.response.body = { tid };
        this.response.redirect = this.url('contest_detail', { tid });
    }

    @param('tid', Types.ObjectId)
    async postDelete(domainId: string, tid: ObjectId) {
        if (!this.user.own(this.tdoc)) this.checkPerm(PERM.PERM_EDIT_CONTEST);
        const [ddocs] = await Promise.all([
            discussion.getMulti(domainId, { parentType: document.TYPE_CONTEST, parentId: tid }).project({ _id: 1 }).toArray(),
            contest.del(domainId, tid),
        ]);
        const tasks: any[] = ddocs.map((i) => discussion.del(domainId, i._id));
        await Promise.all(tasks.concat([
            record.updateMulti(domainId, { domainId, contest: tid }, undefined, undefined, { contest: '' }),
            ScheduleModel.deleteMany({
                type: 'schedule', subType: 'contest', domainId, tid,
            }),
            storage.del(
                (this.tdoc.files?.map((i) => `contest/${domainId}/${tid}/public/${i.name}`) || [])
                    .concat(this.tdoc.privateFiles?.map((i) => `contest/${domainId}/${tid}/private/${i.name}`) || []),
                this.user._id,
            ),
        ]));
        this.response.redirect = this.url('contest_main');
    }
}

export class ContestManagementBaseHandler extends ContestDetailBaseHandler {
    async prepare() {
        if (!this.user.own(this.tdoc)) this.checkPerm(PERM.PERM_EDIT_CONTEST);
    }
}

export class ContestCodeHandler extends Handler {
    @param('tid', Types.ObjectId)
    @param('all', Types.Boolean)
    async get(domainId: string, tid: ObjectId, all: boolean) {
        await this.limitRate('contest_code', 60, 10);
        const [tdoc, tsdocs] = await contest.getAndListStatus(domainId, tid);
        if (!this.user.own(tdoc)) {
            if (!this.user.hasPriv(PRIV.PRIV_READ_RECORD_CODE)) {
                this.checkPerm(PERM.PERM_READ_RECORD_CODE);
            }
            if (!contest.isDone(tdoc)) throw new ContestNotEndedError(domainId, tid);
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
        const zip = new ZipWriter(new BlobWriter('application/zip'), { bufferedWrite: true });
        const rdocs = await record.getMulti(domainId, {
            _id: { $in: Array.from(Object.keys(rnames)).map((id) => new ObjectId(id)) },
        }).toArray();
        await Promise.all(rdocs.map(async (rdoc) => {
            if (rdoc.files?.code) {
                const [id, filename] = rdoc.files?.code?.split('#') || [];
                if (!id) return;
                await zip.add(
                    `${rnames[rdoc._id.toHexString()]}.${filename || 'txt'}`,
                    Readable.toWeb(await storage.get(`submission/${id}`)),
                );
            } else if (rdoc.code) {
                await zip.add(`${rnames[rdoc._id.toHexString()]}.${rdoc.lang}`, new TextReader(rdoc.code));
            }
        }));
        this.binary(await zip.close(), `${tdoc.title}.zip`);
    }
}

export class ContestManagementHandler extends ContestManagementBaseHandler {
    @param('tid', Types.ObjectId)
    async get(domainId: string, tid: ObjectId) {
        this.response.body = {
            tdoc: this.tdoc,
            tsdoc: this.tsdoc,
            owner_udoc: await user.getById(domainId, this.tdoc.owner),
            pdict: await problem.getList(domainId, this.tdoc.pids, true, true, [...problem.PROJECTION_CONTEST_LIST, 'tag']),
            files: sortFiles(this.tdoc.files || []),
            privateFiles: sortFiles(this.tdoc.privateFiles || []),
            urlForFile: (filename: string, type: string) => this.url('contest_file_download', { tid, filename, type }),
        };
        this.response.pjax = [
            ['partials/files.html', { filetype: 'public' }],
            ['partials/files.html', {
                files: this.response.body.privateFiles,
                filetype: 'private',
            }],
        ];
        this.response.template = 'contest_manage.html';
    }

    @param('tid', Types.ObjectId)
    @post('filename', Types.Filename, true)
    @post('type', Types.Range(['private', 'public']), true)
    async postUploadFile(domainId: string, tid: ObjectId, filename: string, type: 'private' | 'public' = 'private') {
        const allFiles = [...(this.tdoc.files || []), ...(this.tdoc.privateFiles || [])];
        if (allFiles.length >= this.ctx.setting.get('limit.contest_files')) {
            throw new FileLimitExceededError('count');
        }
        const file = this.request.files?.file;
        if (!file) throw new ValidationError('file');
        if (Math.sum(allFiles.map((i) => i.size)) + file.size >= this.ctx.setting.get('limit.contest_files_size')) {
            throw new FileLimitExceededError('size');
        }
        filename ||= file.originalFilename || randomstring(16);
        const target = `contest/${domainId}/${tid}/${type}/${filename}`;
        await storage.put(target, file.filepath, this.user._id);
        const meta = await storage.getMeta(target);
        const payload = { _id: filename, name: filename, ...pick(meta, ['size', 'lastModified', 'etag']) };
        if (!meta) throw new FileUploadError();
        const updateList = (files: FileInfo[], newFile: FileInfo) => (files || []).filter((i) => i._id !== newFile._id).concat(newFile);
        await contest.edit(domainId, tid, {
            files: type === 'private' ? this.tdoc.files : updateList(this.tdoc.files, payload),
            privateFiles: type === 'private' ? updateList(this.tdoc.privateFiles, payload) : this.tdoc.privateFiles,
        });
        this.back();
    }

    @param('tid', Types.ObjectId)
    @post('files', Types.ArrayOf(Types.Filename))
    @post('type', Types.Range(['public', 'private']), true)
    async postDeleteFiles(domainId: string, tid: ObjectId, files: string[], type = 'private') {
        await Promise.all([
            storage.del(files.map((t) => `contest/${domainId}/${tid}/${type}/${t}`), this.user._id),
            contest.edit(domainId, tid, type === 'private'
                ? { privateFiles: this.tdoc.privateFiles?.filter((i) => !files.includes(i.name)) }
                : { files: this.tdoc.files?.filter((i) => !files.includes(i.name)) },
            ),
        ]);
        this.back();
    }

    @param('pid', Types.PositiveInt)
    @param('score', Types.PositiveInt)
    async postSetScore(domainId: string, pid: number, score: number) {
        if (!this.tdoc.pids.includes(pid)) throw new ValidationError('pid');
        this.tdoc.score ||= {};
        this.tdoc.score[pid] = score;
        await contest.edit(domainId, this.tdoc.docId, { score: this.tdoc.score });
        await contest.recalcStatus(domainId, this.tdoc.docId);
        this.back();
    }
}

class ContestClarificationHandler extends ContestManagementBaseHandler {
    @param('tid', Types.ObjectId)
    async get(domainId: string, tid: ObjectId) {
        const tcdocs = await contest.getMultiClarification(domainId, tid);
        this.response.body = {
            tdoc: this.tdoc,
            tsdoc: this.tsdoc,
            owner_udoc: await user.getById(domainId, this.tdoc.owner),
            pdict: await problem.getList(domainId, this.tdoc.pids, true, true, [...problem.PROJECTION_CONTEST_LIST, 'tag']),
            tcdocs,
            udict: await user.getListForRender(
                domainId, tcdocs.map((i) => i.owner),
                this.user.hasPerm(PERM.PERM_VIEW_USER_PRIVATE_INFO),
            ),
        };
        this.response.pjax = 'partials/contest_clarification.html';
        this.response.template = 'contest_clarification.html';
    }

    @param('tid', Types.ObjectId)
    @param('content', Types.Content)
    @param('did', Types.ObjectId, true)
    @param('subject', Types.Int, true)
    async postClarification(domainId: string, tid: ObjectId, content: string, did: ObjectId, subject = 0) {
        if (did) {
            const tcdoc = await contest.getClarification(domainId, did);
            await Promise.all([
                contest.addClarificationReply(domainId, did, 0, content, this.request.ip),
                message.send(1, tcdoc.owner, JSON.stringify({
                    message: 'Contest {0} jury replied to your clarification, please go to contest page to view.',
                    params: [this.tdoc.title],
                    url: this.url('contest_problemlist', { tid }),
                }), message.FLAG_I18N | message.FLAG_ALERT),
            ]);
        } else {
            const tsdocs = await contest.getMultiStatus(domainId, { docId: tid, subscribe: 1 }).toArray();
            const uids = Array.from<number>(new Set(tsdocs.map((tsdoc) => tsdoc.uid)));
            const flag = contest.isOngoing(this.tdoc) ? message.FLAG_ALERT : message.FLAG_UNREAD;
            await Promise.all([
                contest.addClarification(domainId, tid, 0, content, this.request.ip, subject),
                message.send(1, uids, JSON.stringify({
                    message: 'Broadcast message from contest {0}:\n{1}',
                    params: [this.tdoc.title, content],
                    url: this.url('contest_problemlist', { tid }),
                }), flag | message.FLAG_I18N),
            ]);
        }
        this.back();
    }
}

export class ContestFileDownloadHandler extends ContestDetailBaseHandler {
    @param('tid', Types.ObjectId)
    @param('filename', Types.Filename)
    @param('noDisposition', Types.Boolean)
    @param('type', Types.Range(['public', 'private']), true)
    async get(domainId: string, tid: ObjectId, filename: string, noDisposition = false, type = 'private') {
        if (contest.RULES[this.tdoc.rule].hidden && !contest.RULES[this.tdoc.rule].features?.includes('download')) {
            throw new ContestNotFoundError(domainId, tid);
        }
        if (type === 'private' && !this.user.own(this.tdoc) && !this.user.hasPerm(PERM.PERM_EDIT_CONTEST)) {
            if (!this.tsdoc?.attend) throw new ContestNotAttendedError(domainId, tid);
            if (!contest.isOngoing(this.tdoc) && !contest.isDone(this.tdoc)) throw new ContestNotLiveError(domainId, tid);
            if (!this.tsdoc.startAt) await contest.setStatus(domainId, tid, this.user._id, { startAt: new Date() });
        }
        this.response.addHeader('Cache-Control', 'public');
        const target = `contest/${domainId}/${tid}/${type}/${filename}`;
        const file = await storage.getMeta(target);
        await oplog.log(this, 'download.file.contest', {
            target,
            size: file?.size || 0,
        });
        this.response.redirect = await storage.signDownloadLink(
            target, noDisposition ? undefined : filename, false, 'user',
        );
    }
}

export class ContestUserHandler extends ContestManagementBaseHandler {
    @param('tid', Types.ObjectId)
    async get(domainId: string, tid: ObjectId) {
        const tsdocs = await contest.getMultiStatus(domainId, { docId: tid }).project({
            uid: 1, attend: 1, startAt: 1, unrank: 1,
        }).toArray();
        for (const tsdoc of tsdocs) {
            tsdoc.endAt = (this.tdoc.duration && tsdoc.startAt) ? moment(tsdoc.startAt).add(this.tdoc.duration, 'hours').toDate() : null;
        }
        const udict = await user.getListForRender(
            domainId, [this.tdoc.owner, ...tsdocs.map((i) => i.uid)],
            this.user.hasPerm(PERM.PERM_VIEW_USER_PRIVATE_INFO),
        );
        this.response.body = { tdoc: this.tdoc, tsdocs, udict };
        this.response.pjax = 'partials/contest_user.html';
        this.response.template = 'contest_user.html';
    }

    @param('tid', Types.ObjectId)
    @param('uids', Types.NumericArray)
    @param('unrank', Types.Boolean)
    async postAddUser(domainId: string, tid: ObjectId, uids: number[], unrank = false) {
        await Promise.all(uids.map((uid) => contest.attend(domainId, tid, uid, { unrank })));
        this.back();
    }

    @param('tid', Types.ObjectId)
    @param('uid', Types.PositiveInt)
    async postRank(domainId: string, tid: ObjectId, uid: number) {
        const tsdoc = await contest.getStatus(domainId, tid, uid);
        if (!tsdoc) throw new ContestNotAttendedError(uid);
        await contest.setStatus(domainId, tid, uid, { unrank: !tsdoc.unrank });
        this.back();
    }
}

export class ContestBalloonHandler extends ContestManagementBaseHandler {
    @param('tid', Types.ObjectId)
    @param('todo', Types.Boolean)
    async get(domainId: string, tid: ObjectId, todo = false) {
        const bdocs = await contest.getMultiBalloon(domainId, tid, {
            ...todo ? { sent: { $exists: false } } : {},
            ...(!this.tdoc.lockAt || this.user.hasPerm(PERM.PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD))
                ? {} : { _id: { $lt: Time.getObjectID(this.tdoc.lockAt) } },
        }).sort({ _id: -1 }).toArray();
        const uids = bdocs.map((i) => i.uid).concat(bdocs.filter((i) => i.sent).map((i) => i.sent));
        this.response.body = {
            tdoc: this.tdoc,
            tsdoc: this.tsdoc,
            owner_udoc: await user.getById(domainId, this.tdoc.owner),
            pdict: await problem.getList(domainId, this.tdoc.pids, true, true, problem.PROJECTION_CONTEST_LIST),
            bdocs,
            udict: await user.getListForRender(domainId, uids, this.user.hasPerm(PERM.PERM_VIEW_USER_PRIVATE_INFO)),
        };
        this.response.pjax = 'partials/contest_balloon.html';
        this.response.template = 'contest_balloon.html';
    }

    @param('tid', Types.ObjectId)
    @param('color', Types.Content)
    async postSetColor(domainId: string, tid: ObjectId, color: string) {
        const config = yaml.load(color);
        if (typeof config !== 'object') throw new ValidationError('color');
        const balloon = {};
        for (const pid of this.tdoc.pids) {
            if (!config[pid]) throw new ValidationError('color');
            balloon[pid] = config[pid.toString()];
        }
        await contest.edit(domainId, tid, { balloon });
        this.back();
    }

    @param('tid', Types.ObjectId)
    @param('balloon', Types.ObjectId)
    async postDone(domainId: string, tid: ObjectId, bid: ObjectId) {
        const balloon = await contest.getBalloon(domainId, tid, bid);
        if (!balloon) throw new ValidationError('balloon');
        if (balloon.sent) throw new ValidationError('Balloon already sent');
        await contest.updateBalloon(domainId, tid, bid, { sent: this.user._id, sentAt: new Date() });
        this.back();
    }
}

interface BuiltinInput {
    tdoc: Tdoc;
    groups: any[];
}
type AnyFunction = (...args: any) => any;
type ParseArgs<T extends { [key: string]: keyof BuiltinInput | AnyFunction | Type<any> }> = {
    [key in keyof T]: T[key] extends keyof BuiltinInput ? BuiltinInput[T[key]] : T[key] extends AnyFunction ? ReturnType<T[key]> : any
};
export interface ScoreboardView<T extends { [key: string]: keyof BuiltinInput | AnyFunction | Type<any> }> {
    id: string;
    name: string;
    supportedRules: string[];
    cacheTime?: number; // in seconds
    args: T;
    display: (this: ContestScoreboardHandler, args: ParseArgs<T>) => Promise<void>;
}

export class ContestScoreboardHandler extends ContestDetailBaseHandler {
    @param('tid', Types.ObjectId)
    @param('view', Types.String, true)
    async get(domainId: string, tid: ObjectId, viewId = 'default') {
        if (contest.RULES[this.tdoc.rule].hidden && !contest.RULES[this.tdoc.rule].features?.includes('scoreboard')) {
            throw new ContestNotFoundError(domainId, tid);
        }
        if (!this.user.own(this.tdoc)) {
            if (!contest.canShowScoreboard.call(this, this.tdoc, true)) throw new ContestScoreboardHiddenError(tid);
            if (contest.isNotStarted(this.tdoc)) throw new ContestNotLiveError(domainId, tid);
        }
        const view = this.ctx.scoreboard.getView(viewId);
        if (!view) throw new NotFoundError(`View ${viewId} not found`);
        const args = {};
        const fetcher = {
            tdoc: () => this.tdoc,
            groups: async () => {
                const allGroups = (this.user.hasPerm(PERM.PERM_EDIT_CONTEST_SELF) && this.user.own(this.tdoc))
                    || this.user.hasPerm(PERM.PERM_EDIT_CONTEST);
                return await user.listGroup(domainId, allGroups ? undefined : this.user._id);
            },
        };
        for (const key in view.args) {
            if (typeof view.args[key] === 'function') {
                try {
                    args[key] = view.args[key](this.args[key]);
                } catch (e) {
                    throw new ValidationError(key);
                }
            } else if (view.args[key] instanceof Array) {
                if (this.args[key] === undefined && view.args[key].find((i) => i === true)) continue;
                if (view.args[key][1] && !view.args[key][1](this.args[key])) throw new ValidationError(key);
                args[key] = view.args[key][0](this.args[key]);
            } else if (fetcher[view.args[key]]) {
                args[key] = await fetcher[view.args[key]](); // eslint-disable-line no-await-in-loop
            }
        }
        await view.display.call(this, args);
    }

    @param('tid', Types.ObjectId)
    async postUnlock(domainId: string, tid: ObjectId) {
        if (!this.user.own(this.tdoc)) this.checkPerm(PERM.PERM_EDIT_CONTEST);
        if (!contest.isDone(this.tdoc)) throw new ContestNotEndedError(domainId, tid);
        await contest.unlockScoreboard(domainId, tid);
        this.back();
    }
}

class ScoreboardService extends Service {
    views: Record<string, ScoreboardView<any>> = {};
    constructor(ctx: Context) {
        super(ctx, 'scoreboard');
    }

    addView<T extends { [key: string]: keyof BuiltinInput | AnyFunction | Type<any> }>(
        id: string, name: string, args: T,
        { display, supportedRules, cacheTime }: {
            display: (this: ContestScoreboardHandler, args: ParseArgs<T>) => Promise<void>;
            supportedRules: string[];
            cacheTime?: number;
        },
    ) {
        if (this.views[id]) throw new Error(`View ${id} already exists`);
        this.ctx.effect(() => {
            this.views[id] = {
                id, name, args, display, supportedRules, cacheTime,
            };
            return () => {
                delete this.views[id];
            };
        });
    }

    getAvailableViews(rule: string) {
        return Object.fromEntries(Object.values(this.views).filter((i) => i.supportedRules.includes(rule) || i.supportedRules.includes('*'))
            .map((i) => [i.id, i.name]));
    }

    getView(id: string) {
        return this.views[id];
    }
}

declare module '../context' {
    interface Context {
        scoreboard: ScoreboardService;
    }
}

export async function apply(ctx: Context) {
    ctx.Route('contest_create', '/contest/create', ContestEditHandler);
    ctx.Route('contest_main', '/contest', ContestListHandler, PERM.PERM_VIEW_CONTEST);
    ctx.Route('contest_detail', '/contest/:tid', ContestDetailHandler, PERM.PERM_VIEW_CONTEST);
    ctx.Route('contest_problemlist', '/contest/:tid/problems', ContestProblemListHandler, PERM.PERM_VIEW_CONTEST);
    ctx.Route('contest_edit', '/contest/:tid/edit', ContestEditHandler, PERM.PERM_VIEW_CONTEST);
    ctx.Route('contest_print', '/contest/:tid/print', ContestPrintHandler, PERM.PERM_VIEW_CONTEST);
    // Support for DOMJudge printfile
    ctx.Route('contest_print_alt', '/contest/:tid/api/printing/team', ContestPrintHandler, PERM.PERM_VIEW_CONTEST);
    ctx.Route('contest_manage', '/contest/:tid/management', ContestManagementHandler);
    ctx.Route('contest_clarification', '/contest/:tid/clarification', ContestClarificationHandler);
    ctx.Route('contest_code', '/contest/:tid/code', ContestCodeHandler, PERM.PERM_VIEW_CONTEST);
    ctx.Route('contest_file_download', '/contest/:tid/file/:type/:filename', ContestFileDownloadHandler, PERM.PERM_VIEW_CONTEST);
    ctx.Route('contest_user', '/contest/:tid/user', ContestUserHandler, PERM.PERM_VIEW_CONTEST);
    ctx.Route('contest_balloon', '/contest/:tid/balloon', ContestBalloonHandler, PERM.PERM_VIEW_CONTEST);
    ctx.worker.addHandler('contest', async (doc) => {
        const tdoc = await contest.get(doc.domainId, doc.tid);
        if (!tdoc) return;
        const tasks = [];
        for (const op of doc.operation) {
            if (op === 'unhide') {
                for (const pid of tdoc.pids) {
                    tasks.push(problem.edit(doc.domainId, pid, { hidden: false }));
                }
            }
        }
        await Promise.all(tasks);
    });
    ctx.plugin(ScoreboardService);
    await ctx.inject(['scoreboard'], ({ Route, scoreboard }) => {
        Route('contest_scoreboard', '/contest/:tid/scoreboard', ContestScoreboardHandler, PERM.PERM_VIEW_CONTEST_SCOREBOARD);
        Route('contest_scoreboard_view', '/contest/:tid/scoreboard/:view', ContestScoreboardHandler, PERM.PERM_VIEW_CONTEST_SCOREBOARD);
        scoreboard.addView('default', 'Default', { tdoc: 'tdoc', groups: 'groups', realtime: Types.Boolean }, {
            async display({ realtime, tdoc, groups }) {
                if (realtime && !this.user.own(tdoc)) {
                    this.checkPerm(PERM.PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD);
                }
                const config: ScoreboardConfig = { isExport: false, showDisplayName: this.user.hasPerm(PERM.PERM_VIEW_USER_PRIVATE_INFO) };
                if (!realtime && this.tdoc.lockAt && !this.tdoc.unlocked) {
                    config.lockAt = this.tdoc.lockAt;
                }
                const [, rows, udict, pdict] = await contest.getScoreboard.call(this, tdoc.domainId, tdoc._id, config);
                // eslint-disable-next-line ts/naming-convention
                const page_name = tdoc.rule === 'homework'
                    ? 'homework_scoreboard'
                    : 'contest_scoreboard';
                const availableViews = scoreboard.getAvailableViews(tdoc.rule);
                this.response.body = {
                    tdoc: this.tdoc, tsdoc: this.tsdocAsPublic(), rows, udict, pdict, page_name, groups, availableViews,
                };
                this.response.pjax = 'partials/scoreboard.html';
                this.response.template = 'contest_scoreboard.html';
            },
            supportedRules: ['*'],
        });
        scoreboard.addView('ghost', 'Ghost', { tdoc: 'tdoc' }, {
            async display({ tdoc }) {
                if (contest.isLocked(tdoc) && !this.user.own(tdoc)) {
                    this.checkPerm(PERM.PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD);
                }
                const [pdict, teams] = await Promise.all([
                    problem.getList(tdoc.domainId, tdoc.pids, true, false, problem.PROJECTION_LIST, true),
                    contest.getMultiStatus(tdoc.domainId, { docId: tdoc._id }).toArray(),
                ]);
                const udict = await user.getList(tdoc.domainId, teams.map((i) => i.uid));
                const teamIds: Record<number, number> = {};
                for (let i = 1; i <= teams.length; i++) teamIds[teams[i - 1].uid] = i;
                const time = (t: ObjectId) => Math.floor((t.getTimestamp().getTime() - tdoc.beginAt.getTime()) / Time.second);
                const pid = (i: number) => getAlphabeticId(i);
                const escape = (i: string) => i.replace(/[",]/g, '');
                const unknownSchool = this.translate('Unknown School');
                const statusMap = {
                    [STATUS.STATUS_ACCEPTED]: 'OK',
                    [STATUS.STATUS_WRONG_ANSWER]: 'WA',
                    [STATUS.STATUS_COMPILE_ERROR]: 'CE',
                    [STATUS.STATUS_TIME_LIMIT_EXCEEDED]: 'TL',
                    [STATUS.STATUS_RUNTIME_ERROR]: 'RT',
                };
                const submissions = teams.flatMap((i, idx) => {
                    if (!i.journal) return [];
                    const journal = i.journal.filter((s) => tdoc.pids.includes(s.pid));
                    const c = Counter();
                    return journal.map((s) => {
                        const id = pid(tdoc.pids.indexOf(s.pid));
                        c[id]++;
                        return `@s ${idx + 1},${id},${c[id]},${time(s.rid)},${statusMap[s.status] || 'RJ'}`;
                    });
                });
                const res = [
                    `@contest "${escape(tdoc.title)}"`,
                    `@contlen ${Math.floor((tdoc.endAt.getTime() - tdoc.beginAt.getTime()) / Time.minute)}`,
                    `@problems ${tdoc.pids.length}`,
                    `@teams ${tdoc.attend}`,
                    `@submissions ${submissions.length}`,
                ].concat(
                    tdoc.pids.map((i, idx) => `@p ${pid(idx)},${escape(pdict[i]?.title || 'Unknown Problem')},20,0`),
                    teams.map((i, idx) => {
                        const showName = this.user.hasPerm(PERM.PERM_VIEW_USER_PRIVATE_INFO) && udict[i.uid].displayName
                            ? udict[i.uid].displayName : udict[i.uid].uname;
                        const teamName = `${i.rank ? '*' : ''}${escape(udict[i.uid].school || unknownSchool)}-${escape(showName)}`;
                        return `@t ${idx + 1},0,1,"${teamName}"`;
                    }),
                    submissions,
                );
                this.binary(res.join('\n'), `${this.tdoc.title}.ghost`);
            },
            supportedRules: ['*'],
        });
        scoreboard.addView('html', 'HTML', { tdoc: 'tdoc' }, {
            async display({ tdoc }) {
                await this.limitRate('scoreboard_download', 60, 3);
                const [, rows] = await contest.getScoreboard.call(this, tdoc.domainId, tdoc._id, {
                    isExport: true, lockAt: this.tdoc.lockAt, showDisplayName: this.user.hasPerm(PERM.PERM_VIEW_USER_PRIVATE_INFO),
                });
                this.binary(await this.renderHTML('contest_scoreboard_download_html.html', { rows, tdoc }), `${this.tdoc.title}.html`);
            },
            supportedRules: ['*'],
        });
        scoreboard.addView('csv', 'CSV', { tdoc: 'tdoc' }, {
            async display({ tdoc }) {
                await this.limitRate('scoreboard_download', 60, 3);
                const [, rows] = await contest.getScoreboard.call(this, tdoc.domainId, tdoc._id, {
                    isExport: true, lockAt: this.tdoc.lockAt, showDisplayName: this.user.hasPerm(PERM.PERM_VIEW_USER_PRIVATE_INFO),
                });
                this.binary(toCSV(rows.map((r) => r.map((c) => c.value.toString())), { bom: true }), `${this.tdoc.title}.csv`);
            },
            supportedRules: ['*'],
        });
    });
}
