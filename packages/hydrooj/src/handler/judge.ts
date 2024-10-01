import assert from 'assert';
import fs from 'fs-extra';
import yaml from 'js-yaml';
import { omit } from 'lodash';
import { ObjectId } from 'mongodb';
import PQueue from 'p-queue';
import sanitize from 'sanitize-filename';
import { Context } from '../context';
import {
    FileLimitExceededError, ForbiddenError, ProblemIsReferencedError, ValidationError,
} from '../error';
import {
    JudgeResultBody, ProblemConfigFile, RecordDoc, Task, TestCase,
} from '../interface';
import { Logger } from '../logger';
import * as builtin from '../model/builtin';
import { PERM, STATUS } from '../model/builtin';
import * as contest from '../model/contest';
import domain from '../model/domain';
import problem from '../model/problem';
import record from '../model/record';
import * as setting from '../model/setting';
import storage from '../model/storage';
import * as system from '../model/system';
import task, { Consumer } from '../model/task';
import user from '../model/user';
import * as bus from '../service/bus';
import { updateJudge } from '../service/monitor';
import {
    ConnectionHandler, Handler, post, subscribe, Types,
} from '../service/server';

const logger = new Logger('judge');

function parseCaseResult(body: TestCase): Required<TestCase> {
    return {
        ...body,
        id: body.id || 0,
        subtaskId: body.subtaskId || 0,
        score: body.score || 0,
        message: body.message || '',
    };
}

function processPayload(body: Partial<JudgeResultBody>) {
    const $set: Partial<RecordDoc> = {};
    const $push: any = {};
    const $unset: any = {};
    const $inc: any = {};
    if (body.cases?.length) {
        const c = body.cases.map(parseCaseResult);
        $push.testCases = { $each: c };
    } else if (body.case) {
        const c = parseCaseResult(body.case);
        $push.testCases = c;
    }
    if (body.message) {
        $push.judgeTexts = body.message;
    }
    if (body.compilerText) {
        $push.compilerTexts = body.compilerText;
    }
    if (body.status) $set.status = body.status;
    if (Number.isFinite(body.score)) $set.score = Math.floor(body.score * 100) / 100;
    if (Number.isFinite(body.time)) $set.time = body.time;
    if (Number.isFinite(body.memory)) $set.memory = body.memory;
    if (body.progress !== undefined) $set.progress = body.progress;
    if (body.subtasks) $set.subtasks = body.subtasks;
    if (body.addProgress) $inc.progress = body.addProgress;
    return {
        $set, $push, $unset, $inc,
    };
}

export async function next(body: Partial<JudgeResultBody>) {
    body.rid = new ObjectId(body.rid); // TODO remove this
    const {
        $set, $push, $unset, $inc,
    } = processPayload(body);
    const rdoc = await record.update(body.domainId, body.rid, $set, $push, $unset, $inc);
    bus.broadcast('record/change', rdoc, $set, $push, body);
    return rdoc;
}

export async function postJudge(rdoc: RecordDoc) {
    if (rdoc.contest?.toString().startsWith('0'.repeat(23))) return;
    const accept = rdoc.status === builtin.STATUS.STATUS_ACCEPTED;
    const updated = await problem.updateStatus(rdoc.domainId, rdoc.pid, rdoc.uid, rdoc._id, rdoc.status, rdoc.score);
    if (rdoc.contest) {
        await contest.updateStatus(
            rdoc.domainId, rdoc.contest, rdoc.uid, rdoc._id,
            rdoc.pid, rdoc.status, rdoc.score, rdoc.subtasks,
        );
    } else if (accept && updated) await domain.incUserInDomain(rdoc.domainId, rdoc.uid, 'nAccept', 1);
    const isNormalSubmission = ![
        STATUS.STATUS_ETC, STATUS.STATUS_HACK_SUCCESSFUL, STATUS.STATUS_HACK_UNSUCCESSFUL,
        STATUS.STATUS_FORMAT_ERROR, STATUS.STATUS_SYSTEM_ERROR, STATUS.STATUS_CANCELED,
    ].includes(rdoc.status);
    const pdoc = (accept && updated)
        ? await problem.inc(rdoc.domainId, rdoc.pid, 'nAccept', 1)
        : await problem.get(rdoc.domainId, rdoc.pid, undefined, true);
    if (pdoc && isNormalSubmission) {
        await Promise.all([
            problem.inc(pdoc.domainId, pdoc.docId, `stats.${builtin.STATUS_SHORT_TEXTS[rdoc.status]}`, 1),
            problem.inc(pdoc.domainId, pdoc.docId, `stats.s${Math.floor(rdoc.score)}`, 1),
        ]);
    }
    await bus.parallel('record/judge', rdoc, updated, pdoc);
}

bus.on('record/judge', async (rdoc, updated, pdoc) => {
    if (!pdoc || rdoc.status !== STATUS.STATUS_HACK_SUCCESSFUL) return;
    if (rdoc.contest) return;
    try {
        const config = yaml.load(pdoc.config as string) as ProblemConfigFile;
        assert(config.subtasks instanceof Array);
        const file = await storage.get(`submission/${rdoc.files.hack.split('#')[0]}`);
        assert(file);
        const hackSubtask = config.subtasks[config.subtasks.length - 1];
        hackSubtask.cases ||= [];
        const input = `hack-${rdoc._id}-${hackSubtask.cases.length + 1}.in`;
        hackSubtask.cases.push({ input, output: '/dev/null' });
        await Promise.all([
            problem.addTestdata(rdoc.domainId, rdoc.pid, input, file),
            problem.addTestdata(rdoc.domainId, rdoc.pid, 'config.yaml', Buffer.from(yaml.dump(config))),
        ]);
        // trigger rejudge
        const rdocs = await record.getMulti(rdoc.domainId, {
            pid: rdoc.pid,
            status: STATUS.STATUS_ACCEPTED,
            contest: { $nin: [record.RECORD_GENERATE, record.RECORD_PRETEST] },
        }).project({ _id: 1, contest: 1 }).toArray();
        const priority = await record.submissionPriority(rdoc.uid, -5000 - rdocs.length * 5 - 50);
        await record.judge(rdoc.domainId, rdocs.map((r) => r._id), priority, {}, { hackRejudge: input });
    } catch (e) {
        next({
            rid: rdoc._id,
            domainId: rdoc.domainId,
            key: 'next',
            message: { message: 'Unable to apply hack: {0}', params: [e.message] },
        });
    }
});

export async function end(body: Partial<JudgeResultBody>) {
    body.rid = new ObjectId(body.rid); // TODO remove this
    const { $set, $push } = processPayload(body);
    const $unset: any = { progress: '' };
    $set.judgeAt = new Date();
    $set.judger = body.judger ?? 1;
    let rdoc = await record.update(body.domainId, body.rid, $set, $push, $unset);
    await postJudge(rdoc);
    rdoc = await record.get(body.rid);
    bus.broadcast('record/change', rdoc, null, null, body); // trigger a full update
    return rdoc;
}

export class JudgeFilesDownloadHandler extends Handler {
    noCheckPermView = true;
    notUsage = true;

    async get() {
        this.response.body = 'ok';
    }

    @post('id', Types.String, true)
    @post('files', Types.Set, true)
    @post('pid', Types.UnsignedInt, true)
    async post(domainId: string, id: string, files: Set<string>, pid: number) {
        if (id) {
            this.response.body = { url: await storage.signDownloadLink(`submission/${id}`, 'code', true, 'judge') };
            return;
        }
        const pdoc = await problem.get(domainId, pid);
        if (!pdoc) this.response.body.links = null;
        const links = {};
        for (const file of files) {
            // eslint-disable-next-line no-await-in-loop
            links[file] = await storage.signDownloadLink(
                `problem/${pdoc.domainId}/${pdoc.docId}/testdata/${file}`,
                file, true, 'judge',
            );
        }
        this.response.body.links = links;
    }
}

export async function processJudgeFileCallback(rid: ObjectId, filename: string, filePath: string) {
    const rdoc = await record.get(rid);
    const [pdoc, udoc] = await Promise.all([
        problem.get(rdoc.domainId, rdoc.pid),
        user.getById(rdoc.domainId, rdoc.uid),
    ]);
    if (!udoc.own(pdoc, PERM.PERM_EDIT_PROBLEM_SELF) && !udoc.hasPerm(PERM.PERM_EDIT_PROBLEM)) throw new ForbiddenError();
    if (pdoc.reference) throw new ProblemIsReferencedError('edit files');
    const stat = await fs.stat(filePath);
    if ((pdoc.data?.length || 0)
        + (pdoc.additional_file?.length || 0)
        >= system.get('limit.problem_files_max')) {
        throw new FileLimitExceededError('count');
    }
    const size = Math.sum(
        (pdoc.data || []).map((i) => i.size),
        (pdoc.additional_file || []).map((i) => i.size),
        stat.size,
    );
    if (size >= system.get('limit.problem_files_max_size')) {
        throw new FileLimitExceededError('size');
    }
    await problem.addTestdata(pdoc.domainId, pdoc.docId, sanitize(filename), fs.createReadStream(filePath), udoc._id);
}

export class JudgeFileUpdateHandler extends Handler {
    notUsage = true;

    @post('rid', Types.ObjectId)
    @post('name', Types.Filename)
    async post(domainId: string, rid: ObjectId, filename: string) {
        if (!this.request.files.file) throw new ValidationError('file');
        await processJudgeFileCallback(rid, filename, this.request.files.file.filepath);
        this.response.body = { ok: 1 };
    }
}

export class JudgeConnectionHandler extends ConnectionHandler {
    category = '#judge';
    query: any = { type: { $in: ['judge', 'generate'] } };
    concurrency = 1;
    consumer: Consumer = null;
    startTimeout: NodeJS.Timeout = null;
    tasks: Record<string, {
        resolve: (_: any) => void,
        queue: PQueue,
        domainId: string,
        t: Task,
    }> = {};

    async prepare() {
        logger.info('Judge daemon connected from ', this.request.ip);
        this.sendLanguageConfig();
        // TODO deprecated, just for compatibility
        this.startTimeout = setTimeout(() => {
            this.consumer ||= task.consume(this.query, this.newTask.bind(this), true, this.concurrency);
        }, 15000);
    }

    @subscribe('system/setting')
    sendLanguageConfig() {
        this.send({ language: setting.langs });
    }

    async newTask(t: Task) {
        const rdoc = await record.get(t.domainId, t.rid);
        if (!rdoc) return;

        const rid = rdoc._id.toHexString();
        let resolve: (_: any) => void;
        const p = new Promise((r) => { resolve = r; });
        this.tasks[rid] = {
            queue: new PQueue({ concurrency: 1 }),
            domainId: rdoc.domainId,
            resolve,
            t,
        };
        this.send({ task: { ...rdoc, ...t } });
        this.tasks[rid].queue.add(() => next({ status: STATUS.STATUS_FETCHED, domainId: rdoc.domainId, rid: rdoc._id }));
        await p;
        delete this.tasks[rid];
    }

    async message(msg) {
        if (!['ping', 'prio', 'config', 'start'].includes(msg.key)) {
            const method = ['status', 'next'].includes(msg.key) ? 'debug' : 'info';
            const keys = method === 'debug' ? ['key'] : ['key', 'subtasks', 'cases'];
            logger[method]('%o', omit(msg, keys));
        }
        if (['next', 'end'].includes(msg.key)) {
            const t = this.tasks[msg.rid];
            if (!t) return;
            msg.domainId = t.domainId;
            if (msg.key === 'next') t.queue.add(() => next(msg));
            if (msg.key === 'end') {
                if (!msg.nop) t.queue.add(() => end({ judger: this.user._id, ...msg }));
                t.resolve(null);
            }
        } else if (msg.key === 'status') {
            await updateJudge(msg.info);
        } else if (msg.key === 'prio' && typeof msg.prio === 'number') {
            // TODO deprecated, use config instead
            this.query.priority = { $gt: msg.prio };
            this.consumer?.setQuery(this.query);
        } else if (msg.key === 'config') {
            if (Number.isSafeInteger(msg.prio)) {
                this.query.priority = { $gt: msg.prio };
                this.consumer?.setQuery(this.query);
            }
            if (Number.isSafeInteger(msg.concurrency) && msg.concurrency > 0) {
                this.concurrency = msg.concurrency;
                this.consumer?.setConcurrency(msg.concurrency);
            }
            if (msg.lang instanceof Array && msg.lang.every((i) => typeof i === 'string')) {
                this.query.lang = { $in: msg.lang };
                this.consumer?.setQuery(this.query);
            }
            if (msg.type instanceof Array && msg.type.every((i) => typeof i === 'string')) {
                this.query.type = { $in: msg.type };
                this.consumer?.setQuery(this.query);
            }
        } else if (msg.key === 'start') {
            clearTimeout(this.startTimeout);
            this.consumer ||= task.consume(this.query, this.newTask.bind(this), true, this.concurrency);
            logger.info('Judge daemon started');
        }
    }

    async cleanup() {
        clearTimeout(this.startTimeout);
        this.consumer?.destroy();
        logger.info('Judge daemon disconnected from ', this.request.ip);
        await Promise.all(Object.values(this.tasks).map(async ({ t }) => {
            const rdoc = await record.reset(t.domainId, t.rid, false);
            bus.broadcast('record/change', rdoc);
            return task.add(t);
        }));
    }
}

export async function apply(ctx: Context) {
    ctx.Route('judge_files_download', '/judge/files', JudgeFilesDownloadHandler, builtin.PRIV.PRIV_JUDGE);
    ctx.Route('judge_files_upload', '/judge/upload', JudgeFileUpdateHandler, builtin.PRIV.PRIV_JUDGE);
    ctx.Connection('judge_conn', '/judge/conn', JudgeConnectionHandler, builtin.PRIV.PRIV_JUDGE);
}

apply.next = next;
apply.end = end;
