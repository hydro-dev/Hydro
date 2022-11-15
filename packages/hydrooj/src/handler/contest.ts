import AdmZip from 'adm-zip';
import { statSync } from 'fs-extra';
import { pick } from 'lodash';
import moment from 'moment-timezone';
import { ObjectID } from 'mongodb';
import { sortFiles, Time } from '@hydrooj/utils/lib/utils';
import {
    BadRequestError, ContestNotEndedError, ContestNotFoundError, ContestNotLiveError,
    ForbiddenError, InvalidTokenError, PermissionError,
    ValidationError,
} from '../error';
import { Tdoc } from '../interface';
import paginate from '../lib/paginate';
import { PERM, PRIV } from '../model/builtin';
import * as contest from '../model/contest';
import message from '../model/message';
import * as oplog from '../model/oplog';
import problem from '../model/problem';
import record from '../model/record';
import ScheduleModel from '../model/schedule';
import storage from '../model/storage';
import * as system from '../model/system';
import user from '../model/user';
import {
    Handler, param, post, Types,
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
        ctx.checkPerm(PERM.PERM_VIEW);
        arg.id = new ObjectID(arg.id);
        ctx.tdoc = await contest.get(ctx.args.domainId, new ObjectID(arg.id));
        if (!ctx.tdoc) throw new ContestNotFoundError(ctx.args.domainId, arg.id);
        return ctx.tdoc;
    },
    'Get a contest by ID',
);

ScheduleModel.Worker.addHandler('contest', async (doc) => {
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

export class ContestListHandler extends Handler {
    @param('rule', Types.Range(contest.RULES), true)
    @param('page', Types.PositiveInt, true)
    async get(domainId: string, rule = '', page = 1) {
        if (rule && contest.RULES[rule].hidden) throw new BadRequestError();
        const rules = Object.keys(contest.RULES).filter((i) => !contest.RULES[i].hidden);
        const cursor = contest.getMulti(domainId, rule ? { rule } : { rule: { $in: rules } });
        const qs = rule ? `rule=${rule}` : '';
        const [tdocs, tpcount] = await paginate<Tdoc>(cursor, page, system.get('pagination.contest'));
        const tids = [];
        for (const tdoc of tdocs) tids.push(tdoc.docId);
        const tsdict = await contest.getListStatus(domainId, this.user._id, tids);
        this.response.template = 'contest_main.html';
        this.response.body = {
            page, tpcount, qs, rule, tdocs, tsdict,
        };
    }
}

export class ContestDetailBaseHandler extends Handler {
    tdoc?: Tdoc<30>;
    tsdoc?: any;

    @param('tid', Types.ObjectID, true)
    async __prepare(domainId: string, tid: ObjectID) {
        if (!tid) return; // ProblemDetailHandler also extends from ContestDetailBaseHandler
        [this.tdoc, this.tsdoc] = await Promise.all([
            contest.get(domainId, tid),
            contest.getStatus(domainId, tid, this.user._id),
        ]);
        if (this.tdoc.assign?.length && !this.user.own(this.tdoc)) {
            const groups = await user.listGroup(domainId, this.user._id);
            if (!Set.intersection(this.tdoc.assign, groups.map((i) => i.name)).size) {
                throw new ForbiddenError('You are not assigned.');
            }
        }
        if (this.tdoc.duration && this.tsdoc?.startAt) {
            this.tsdoc.endAt = moment(this.tsdoc.startAt).add(this.tdoc.duration, 'hours').toDate();
        }
    }

    @param('tid', Types.ObjectID, true)
    async after(domainId: string, tid: ObjectID) {
        if (!tid || this.tdoc.rule === 'homework' || !contest.isOngoing(this.tdoc, this.tsdoc)) return;
        if (this.request.json || !this.response.template) return;
        const pdoc = 'pdoc' in this ? (this as any).pdoc : {};
        this.response.body.overrideNav = [
            { name: 'homepage', args: { prefix: 'homepage' }, checker: () => true },
            {
                name: 'contest_detail',
                displayName: this.tdoc.title,
                args: { tid, prefix: 'contest_detail' },
                checker: () => true,
            },
            {
                name: 'contest_scoreboard',
                args: { tid, prefix: 'contest_scoreboard' },
                checker: () => contest.canShowScoreboard.call(this, this.tdoc, true),
            },
            {
                name: 'record_main',
                args: {
                    prefix: 'record',
                    query: contest.canShowRecord.call(this, this.tdoc, true)
                        ? { tid }
                        : { tid, uidOrName: this.user._id },
                },
                checker: () => contest.canShowSelfRecord.call(this, this.tdoc, true),
            },
            {
                displayName: `${String.fromCharCode(65 + this.tdoc.pids.indexOf(pdoc.docId))}. ${pdoc.title}`,
                args: { query: { tid }, pid: pdoc.docId, prefix: 'contest_detail_problem' },
                checker: () => 'pdoc' in this,
            },
        ];
    }
}

export class ContestDetailHandler extends ContestDetailBaseHandler {
    @param('tid', Types.ObjectID)
    async prepare(domainId: string, tid: ObjectID) {
        if (contest.RULES[this.tdoc.rule].hidden) throw new ContestNotFoundError(domainId, tid);
    }

    @param('tid', Types.ObjectID)
    async get(domainId: string, tid: ObjectID) {
        this.response.template = 'contest_detail.html';
        const udict = await user.getList(domainId, [this.tdoc.owner]);
        this.response.body = {
            tdoc: this.tdoc, tsdoc: pick(this.tsdoc, ['attend', 'startAt']), udict,
        };
        if (!this.request.json) {
            this.response.body.tdoc.content = this.response.body.tdoc.content
                .replace(/\(file:\/\//g, `(./${this.tdoc.docId}/file/`)
                .replace(/="file:\/\//g, `="./${this.tdoc.docId}/file/`);
        }
        if (
            (contest.isNotStarted(this.tdoc) || (!this.tsdoc?.attend && !contest.isDone(this.tdoc)))
            && !this.user.own(this.tdoc)
            && !this.user.hasPerm(PERM.PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD)
        ) return;
        const pdict = await problem.getList(domainId, this.tdoc.pids, true, undefined, undefined, problem.PROJECTION_CONTEST_LIST);
        let psdict = {};
        let rdict = {};
        if (this.tsdoc) {
            if (this.tsdoc.attend && !this.tsdoc.startAt && contest.isOngoing(this.tdoc)) {
                await contest.setStatus(domainId, tid, this.user._id, { startAt: new Date() });
                this.tsdoc.startAt = new Date();
            }
            psdict = this.tsdoc.detail || {};
            if (contest.canShowSelfRecord.call(this, this.tdoc)) {
                rdict = await record.getList(domainId, Object.values(psdict).map((i: any) => i.rid));
            } else {
                for (const i in psdict) rdict[psdict[i].rid] = { _id: psdict[i].rid };
            }
        }
        Object.assign(this.response.body, { pdict, psdict, rdict });
    }

    @param('tid', Types.ObjectID)
    @param('code', Types.String, true)
    async postAttend(domainId: string, tid: ObjectID, code = '') {
        if (contest.isDone(this.tdoc)) throw new ContestNotLiveError(tid);
        if (this.tdoc._code && code !== this.tdoc._code) throw new InvalidTokenError(code);
        await contest.attend(domainId, tid, this.user._id);
        this.back();
    }

    @param('tid', Types.ObjectID)
    async postDelete(domainId: string, tid: ObjectID) {
        if (!this.user.own(this.tdoc)) this.checkPerm(PERM.PERM_EDIT_CONTEST);
        await contest.del(domainId, tid);
        await record.updateMulti(domainId, { domainId, contest: tid }, undefined, undefined, { contest: '' });
        await ScheduleModel.deleteMany({
            type: 'schedule', subType: 'contest', domainId, tid,
        });
        this.response.redirect = this.url('contest_main');
    }
}

export class ContestBroadcastHandler extends ContestDetailBaseHandler {
    async prepare() {
        if (!this.user.own(this.tdoc)) throw new PermissionError('Boardcast Message');
    }

    async get() {
        this.response.template = 'contest_broadcast.html';
    }

    @param('tid', Types.ObjectID)
    @param('content', Types.Content)
    async post(domainId: string, tid: ObjectID, content: string) {
        const tsdocs = await contest.getMultiStatus(domainId, { docId: tid }).toArray();
        const uids: number[] = Array.from(new Set(tsdocs.map((tsdoc) => tsdoc.uid)));
        await Promise.all(
            uids.map((uid) => message.send(this.user._id, uid, content, message.FLAG_ALERT)),
        );
        this.response.redirect = this.url('contest_detail', { tid });
    }
}

export class ContestScoreboardHandler extends ContestDetailBaseHandler {
    @param('tid', Types.ObjectID)
    @param('ext', Types.Range(['csv', 'html']), true)
    async get(domainId: string, tid: ObjectID, ext = '') {
        if (ext) {
            await this.exportScoreboard(domainId, tid, ext);
            return;
        }
        const pdict = await problem.getList(domainId, this.tdoc.pids, true, undefined, false, [
            // Problem statistics display is allowed as we can view submission info in scoreboard.
            ...problem.PROJECTION_CONTEST_LIST, 'nSubmit', 'nAccept',
        ]);
        const [, rows, udict] = await contest.getScoreboard.call(this, domainId, tid, false);
        this.response.template = 'contest_scoreboard.html';
        // eslint-disable-next-line @typescript-eslint/naming-convention
        const page_name = this.tdoc.rule === 'homework'
            ? 'homework_scoreboard'
            : 'contest_scoreboard';
        this.response.body = {
            tdoc: this.tdoc, rows, udict, pdict, page_name,
        };
    }

    async exportScoreboard(domainId: string, tid: ObjectID, ext: string) {
        await this.limitRate('scoreboard_download', 120, 3);
        const getContent = {
            csv: async (rows) => `\uFEFF${rows.map((c) => (c.map((i) => i.value?.toString().replace(/\n/g, ' ')).join(','))).join('\n')}`,
            html: (rows, tdoc) => this.renderHTML('contest_scoreboard_download_html.html', { rows, tdoc }),
        };
        const [, rows] = await contest.getScoreboard.call(this, domainId, tid, true);
        this.binary(await getContent[ext](rows, this.tdoc), `${this.tdoc.title}.${ext}`);
    }

    @param('tid', Types.ObjectID)
    async postUnlock(domainId: string, tid: ObjectID) {
        if (!this.user.own(this.tdoc)) this.checkPerm(PERM.PERM_EDIT_CONTEST);
        if (!contest.isDone(this.tdoc)) throw new ContestNotEndedError(domainId, tid);
        await contest.unlockScoreboard(domainId, tid);
        this.back();
    }
}

export class ContestEditHandler extends Handler {
    tdoc: Tdoc;

    @param('tid', Types.ObjectID, true)
    async prepare(domainId: string, tid: ObjectID) {
        if (tid) {
            this.tdoc = await contest.get(domainId, tid);
            if (!this.tdoc) throw new ContestNotFoundError(domainId, tid);
            if (contest.RULES[this.tdoc.rule].hidden) throw new ContestNotFoundError(domainId, tid);
            if (!this.user.own(this.tdoc)) this.checkPerm(PERM.PERM_EDIT_CONTEST);
            else this.checkPerm(PERM.PERM_EDIT_CONTEST_SELF);
        } else this.checkPerm(PERM.PERM_CREATE_CONTEST);
    }

    @param('tid', Types.ObjectID, true)
    async get(domainId: string, tid: ObjectID) {
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
        };
    }

    @param('tid', Types.ObjectID, true)
    @param('beginAtDate', Types.Date)
    @param('beginAtTime', Types.Time)
    @param('duration', Types.Float)
    @param('title', Types.Title)
    @param('content', Types.Content)
    @param('rule', Types.Range(Object.keys(contest.RULES).filter((i) => !contest.RULES[i].hidden)))
    @param('pids', Types.Content)
    @param('rated', Types.Boolean)
    @param('code', Types.String, true)
    @param('autoHide', Types.Boolean, true)
    @param('assign', Types.CommaSeperatedArray, true)
    @param('lock', Types.UnsignedInt, true)
    @param('contestDuration', Types.Float, true)
    async post(
        domainId: string, tid: ObjectID, beginAtDate: string, beginAtTime: string, duration: number,
        title: string, content: string, rule: string, _pids: string, rated = false,
        _code = '', autoHide = false, assign: string[] = null, lock: number = null,
        contestDuration: number = null,
    ) {
        if (autoHide) this.checkPerm(PERM.PERM_EDIT_PROBLEM);
        const pids = _pids.replace(/，/g, ',').split(',').map((i) => +i).filter((i) => i);
        const beginAtMoment = moment.tz(`${beginAtDate} ${beginAtTime}`, this.user.timeZone);
        if (!beginAtMoment.isValid()) throw new ValidationError('beginAtDate', 'beginAtTime');
        const endAt = beginAtMoment.clone().add(duration, 'hours').toDate();
        if (beginAtMoment.isSameOrAfter(endAt)) throw new ValidationError('duration');
        const beginAt = beginAtMoment.toDate();
        const lockAt = lock ? moment(endAt).add(-lock, 'minutes').toDate() : null;
        await problem.getList(domainId, pids, this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN) || this.user._id, this.user.group, true);
        if (tid) {
            await contest.edit(domainId, tid, {
                title, content, rule, beginAt, endAt, pids, rated, duration: contestDuration,
            });
            if (this.tdoc.beginAt !== beginAt || this.tdoc.endAt !== endAt
                || Array.isDiff(this.tdoc.pids, pids) || this.tdoc.rule !== rule
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
            // eslint-disable-next-line no-await-in-loop
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

export class ContestFilesHandler extends ContestDetailBaseHandler {
    @param('tid', Types.ObjectID)
    @param('pjax', Types.Boolean)
    async get(domainId: string, tid: ObjectID, pjax = false) {
        if (!this.user.own(this.tdoc)) this.checkPerm(PERM.PERM_EDIT_CONTEST);
        const body = {
            tdoc: this.tdoc,
            tsdoc: this.tsdoc,
            owner_udoc: await user.getById(domainId, this.tdoc.owner),
            files: sortFiles(this.tdoc.files || []),
            urlForFile: (filename: string) => this.url('contest_file_download', { tid, filename }),
        };
        if (pjax) {
            this.response.body = {
                fragments: (await Promise.all([
                    this.renderHTML('partials/files.html', body),
                ])).map((i) => ({ html: i })),
            };
            this.response.template = '';
        } else {
            this.response.template = 'contest_files.html';
            this.response.body = body;
        }
    }

    @param('tid', Types.ObjectID)
    async post(domainId: string, tid: ObjectID) {
        const tdoc = await contest.get(domainId, tid);
        if (!this.user.own(tdoc)) this.checkPerm(PERM.PERM_EDIT_CONTEST);
    }

    @param('tid', Types.ObjectID)
    @post('filename', Types.Name, true)
    async postUploadFile(domainId: string, tid: ObjectID, filename: string) {
        if ((this.tdoc.files?.length || 0) >= system.get('limit.contest_files')) {
            throw new ForbiddenError('File limit exceeded.');
        }
        const file = this.request.files?.file;
        if (!file) throw new ValidationError('file');
        const f = statSync(file.filepath);
        const size = Math.sum((this.tdoc.files || []).map((i) => i.size)) + f.size;
        if (size >= system.get('limit.contest_files_size')) {
            throw new ForbiddenError('File size limit exceeded.');
        }
        if (!filename) filename = file.originalFilename || String.random(16);
        if (filename.includes('/') || filename.includes('..')) throw new ValidationError('filename', null, 'Bad filename');
        await storage.put(`contest/${domainId}/${tid}/${filename}`, file.filepath, this.user._id);
        const meta = await storage.getMeta(`contest/${domainId}/${tid}/${filename}`);
        const payload = { name: filename, ...pick(meta, ['size', 'lastModified', 'etag']) };
        if (!meta) throw new Error('Upload failed');
        await contest.edit(domainId, tid, { files: [...(this.tdoc.files || []), payload] });
        this.back();
    }

    @param('tid', Types.ObjectID)
    @post('files', Types.Array)
    async postDeleteFiles(domainId: string, tid: ObjectID, files: string[]) {
        await Promise.all([
            storage.del(files.map((t) => `contest/${domainId}/${tid}/${t}`), this.user._id),
            contest.edit(domainId, tid, { files: this.tdoc.files.filter((i) => !files.includes(i.name)) }),
        ]);
        this.back();
    }
}

export class ContestFileDownloadHandler extends ContestDetailBaseHandler {
    @param('tid', Types.ObjectID)
    @param('filename', Types.Name)
    @param('noDisposition', Types.Boolean)
    async get(domainId: string, tid: ObjectID, filename: string, noDisposition = false) {
        this.response.addHeader('Cache-Control', 'public');
        const target = `contest/${domainId}/${tid}/${filename}`;
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

export async function apply(ctx) {
    ctx.Route('contest_create', '/contest/create', ContestEditHandler);
    ctx.Route('contest_main', '/contest', ContestListHandler, PERM.PERM_VIEW_CONTEST);
    ctx.Route('contest_detail', '/contest/:tid', ContestDetailHandler, PERM.PERM_VIEW_CONTEST);
    ctx.Route('contest_broadcast', '/contest/:tid/broadcast', ContestBroadcastHandler);
    ctx.Route('contest_edit', '/contest/:tid/edit', ContestEditHandler, PERM.PERM_VIEW_CONTEST);
    ctx.Route('contest_scoreboard', '/contest/:tid/scoreboard', ContestScoreboardHandler, PERM.PERM_VIEW_CONTEST);
    ctx.Route('contest_scoreboard_download', '/contest/:tid/export/:ext', ContestScoreboardHandler, PERM.PERM_VIEW_CONTEST);
    ctx.Route('contest_code', '/contest/:tid/code', ContestCodeHandler, PERM.PERM_VIEW_CONTEST);
    ctx.Route('contest_files', '/contest/:tid/file', ContestFilesHandler, PERM.PERM_VIEW_CONTEST);
    ctx.Route('contest_file_download', '/contest/:tid/file/:filename', ContestFileDownloadHandler, PERM.PERM_VIEW_CONTEST);
}
