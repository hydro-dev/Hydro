import assert from 'assert';
import yaml from 'js-yaml';
import { ObjectID } from 'mongodb';
import {
    JudgeResultBody, ProblemConfigFile, RecordDoc, TestCase,
} from '../interface';
import { Logger } from '../logger';
import * as builtin from '../model/builtin';
import { STATUS } from '../model/builtin';
import * as contest from '../model/contest';
import domain from '../model/domain';
import problem from '../model/problem';
import record from '../model/record';
import * as setting from '../model/setting';
import storage from '../model/storage';
import task from '../model/task';
import * as bus from '../service/bus';
import { updateJudge } from '../service/monitor';
import {
    Connection, ConnectionHandler, Handler, post, Route, Types,
} from '../service/server';
import { sleep } from '../utils';

const logger = new Logger('judge');

export async function next(body: Partial<JudgeResultBody>) {
    body.rid = new ObjectID(body.rid);
    let rdoc = await record.get(body.rid);
    if (!rdoc) return;
    const $set: Partial<RecordDoc> = {};
    const $push: any = {};
    if (body.case) {
        const c: Required<TestCase> = {
            ...body.case,
            id: body.case.id || 0,
            subtaskId: body.case.subtaskId || 0,
            score: body.case.score || 0,
            message: body.case.message || '',
        };
        rdoc.testCases.push(c);
        $push.testCases = c;
    }
    if (body.message) {
        rdoc.judgeTexts.push(body.message);
        $push.judgeTexts = body.message;
    }
    if (body.compilerText) {
        rdoc.compilerTexts.push(body.compilerText);
        $push.compilerTexts = body.compilerText;
    }
    if (body.status) $set.status = body.status;
    if (body.score !== undefined) $set.score = body.score;
    if (body.time !== undefined) $set.time = body.time;
    if (body.memory !== undefined) $set.memory = body.memory;
    if (body.progress !== undefined) $set.progress = body.progress;
    rdoc = await record.update(rdoc.domainId, body.rid, $set, $push, {}, body.addProgress ? { progress: body.addProgress } : {});
    bus.broadcast('record/change', rdoc!, $set, $push);
}

export async function postJudge(rdoc: RecordDoc) {
    if (typeof rdoc.input === 'string') return;
    const accept = rdoc.status === builtin.STATUS.STATUS_ACCEPTED;
    const updated = await problem.updateStatus(rdoc.domainId, rdoc.pid, rdoc.uid, rdoc._id, rdoc.status, rdoc.score);
    if (rdoc.contest) {
        await contest.updateStatus(
            rdoc.domainId, rdoc.contest, rdoc.uid, rdoc._id,
            rdoc.pid, rdoc.status, rdoc.score,
        );
    } else if (accept && updated) await domain.incUserInDomain(rdoc.domainId, rdoc.uid, 'nAccept', 1);
    const isNormalSubmission = ![
        STATUS.STATUS_ETC, STATUS.STATUS_HACK_SUCCESSFUL, STATUS.STATUS_HACK_UNSUCCESSFUL,
        STATUS.STATUS_FORMAT_ERROR, STATUS.STATUS_SYSTEM_ERROR, STATUS.STATUS_CANCELED,
    ].includes(rdoc.status);
    const pdoc = (accept && updated)
        ? await problem.inc(rdoc.domainId, rdoc.pid, 'nAccept', 1)
        : await problem.get(rdoc.domainId, rdoc.pid, undefined, true);
    if (pdoc) {
        if (isNormalSubmission) {
            await Promise.all([
                problem.inc(pdoc.domainId, pdoc.docId, `stats.${builtin.STATUS_SHORT_TEXTS[rdoc.status]}`, 1),
                problem.inc(pdoc.domainId, pdoc.docId, `stats.s${rdoc.score}`, 1),
            ]);
        }
        if (rdoc.status === STATUS.STATUS_HACK_SUCCESSFUL) {
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
                    contest: { $ne: new ObjectID('0'.repeat(24)) },
                }).project({ _id: 1, contest: 1 }).toArray();
                const priority = await record.submissionPriority(rdoc.uid, -rdocs.length * 5 - 50);
                await Promise.all(rdocs.map(
                    (r) => record.judge(rdoc.domainId, r._id, priority, r.contest ? { detail: false } : {}, { hackRejudge: input }),
                ));
            } catch (e) {
                next({
                    rid: rdoc._id, domainId: rdoc.domainId, key: 'next', message: { message: 'Unable to apply hack: {0}', params: [e.message] },
                });
            }
        }
    }
    await bus.serial('record/judge', rdoc, updated);
}

export async function end(body: Partial<JudgeResultBody>) {
    if (body.rid) body.rid = new ObjectID(body.rid);
    let rdoc = await record.get(body.rid);
    if (!rdoc) return;
    const $set: Partial<RecordDoc> = {};
    const $push: any = {};
    const $unset: any = { progress: '' };
    if (body.message) {
        rdoc.judgeTexts.push(body.message);
        $push.judgeTexts = body.message;
    }
    if (body.compilerText) {
        rdoc.compilerTexts.push(body.compilerText);
        $push.compilerTexts = body.compilerText;
    }
    if (body.status) $set.status = body.status;
    if (Number.isSafeInteger(body.score)) $set.score = body.score;
    if (Number.isFinite(body.time)) $set.time = body.time;
    if (Number.isFinite(body.memory)) $set.memory = body.memory;
    $set.judgeAt = new Date();
    $set.judger = body.judger ?? 1;
    await sleep(100); // Make sure that all 'next' event already triggered
    rdoc = await record.update(rdoc.domainId, body.rid, $set, $push, $unset);
    await postJudge(rdoc);
    bus.broadcast('record/change', rdoc); // trigger a full update
}

export class JudgeFilesDownloadHandler extends Handler {
    async get() {
        this.response.body = 'ok';
    }

    noCheckPermView = true;
    @post('files', Types.Set)
    @post('pid', Types.UnsignedInt)
    async post(domainId: string, files: Set<string>, pid: number) {
        const pdoc = await problem.get(domainId, pid);
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

export class SubmissionDataDownloadHandler extends Handler {
    @post('id', Types.String)
    async post(domainId: string, id: string) {
        this.response.body = { url: await storage.signDownloadLink(`submission/${id}`, 'code', true, 'judge') };
    }
}

class JudgeConnectionHandler extends ConnectionHandler {
    processing: any = null;
    closed = false;
    query: any = { type: 'judge' };
    ip: string;

    async prepare() {
        logger.info('Judge daemon connected from ', this.request.ip);
        this.send({ language: setting.langs });
        this.sendLanguageConfig = this.sendLanguageConfig.bind(this);
        bus.on('system/setting', this.sendLanguageConfig);
        // Ensure language sent
        await sleep(100);
        this.newTask();
    }

    async sendLanguageConfig() {
        this.send({ language: setting.langs });
    }

    async newTask() {
        if (this.processing) return;
        let t;
        while (!t) {
            if (this.closed) return;
            // eslint-disable-next-line no-await-in-loop
            t = await task.getFirst(this.query);
            // eslint-disable-next-line no-await-in-loop
            if (!t) await sleep(500);
        }
        this.send({ task: t });
        this.processing = t;
        const $set = { status: builtin.STATUS.STATUS_FETCHED };
        const rdoc = await record.update(t.domainId, t.rid, $set, {});
        bus.broadcast('record/change', rdoc, $set, {});
    }

    async message(msg) {
        if (msg.key !== 'ping' && msg.key !== 'prio') logger[['status', 'next'].includes(msg.key) ? 'debug' : 'info']('%o', msg);
        if (msg.key === 'next') await next(msg);
        else if (msg.key === 'end') {
            if (!msg.nop) await end({ judger: this.user._id, ...msg }).catch((e) => logger.error(e));
            this.processing = null;
            await this.newTask();
        } else if (msg.key === 'status') {
            await updateJudge(msg.info);
        } else if (msg.key === 'prio') {
            this.query.priority = { $gt: msg.prio };
        }
    }

    async cleanup() {
        logger.info('Judge daemon disconnected from ', this.request.ip);
        bus.off('system/setting', this.sendLanguageConfig);
        if (this.processing) {
            await record.reset(this.processing.domainId, this.processing.rid, false);
            await task.add(this.processing);
        }
        this.closed = true;
    }
}

export async function apply() {
    Route('judge_files_download', '/judge/files', JudgeFilesDownloadHandler, builtin.PRIV.PRIV_JUDGE);
    Route('judge_submission_download', '/judge/code', SubmissionDataDownloadHandler, builtin.PRIV.PRIV_JUDGE);
    Connection('judge_conn', '/judge/conn', JudgeConnectionHandler, builtin.PRIV.PRIV_JUDGE);
}

apply.next = next;
apply.end = end;

global.Hydro.handler.judge = apply;
