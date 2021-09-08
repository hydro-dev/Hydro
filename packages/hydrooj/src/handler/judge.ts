import { ObjectID } from 'mongodb';
import { JudgeResultBody, RecordDoc, TestCase } from '../interface';
import { sleep } from '../utils';
import { Logger } from '../logger';
import difficultyAlgorithm from '../lib/difficulty';
import record from '../model/record';
import problem from '../model/problem';
import * as setting from '../model/setting';
import * as builtin from '../model/builtin';
import * as contest from '../model/contest';
import domain from '../model/domain';
import task from '../model/task';
import * as system from '../model/system';
import storage from '../model/storage';
import * as bus from '../service/bus';
import {
    Route, Handler, Connection, ConnectionHandler, post, Types,
} from '../service/server';
import { updateJudge } from '../service/monitor';

const logger = new Logger('judge');

export async function postJudge(rdoc: RecordDoc) {
    if (typeof rdoc.input === 'string') return;
    const accept = rdoc.status === builtin.STATUS.STATUS_ACCEPTED;
    const updated = await problem.updateStatus(rdoc.pdomain, rdoc.pid, rdoc.uid, rdoc._id, rdoc.status, rdoc.score);
    if (rdoc.contest) {
        await contest.updateStatus(
            rdoc.domainId, rdoc.contest.tid, rdoc.uid, rdoc._id,
            rdoc.domainId === rdoc.pdomain ? rdoc.pid : `${rdoc.pdomain}:${rdoc.pid}`,
            rdoc.status, rdoc.score, rdoc.contest.type,
        );
    } else if (accept && updated) await domain.incUserInDomain(rdoc.domainId, rdoc.uid, 'nAccept', 1);
    const pdoc = (accept && updated)
        ? await problem.inc(rdoc.pdomain, rdoc.pid, 'nAccept', 1)
        : await problem.get(rdoc.pdomain, rdoc.pid);
    if (pdoc) {
        const difficulty = difficultyAlgorithm(pdoc.nSubmit, pdoc.nAccept);
        await Promise.all([
            problem.edit(pdoc.domainId, pdoc.docId, { difficulty }),
            problem.inc(pdoc.domainId, pdoc.docId, `stats.${builtin.STATUS_SHORT_TEXTS[rdoc.status]}`, 1),
            problem.inc(pdoc.domainId, pdoc.docId, `stats.s${rdoc.score}`, 1),
        ]);
    }
    await bus.serial('record/judge', rdoc, updated);
}

export async function next(body: JudgeResultBody) {
    body.rid = new ObjectID(body.rid);
    let rdoc = await record.get(body.rid);
    if (!rdoc) return;
    const $set: Partial<RecordDoc> = {};
    const $push: any = {};
    if (body.case) {
        const c: TestCase = {
            memory: body.case.memory,
            time: body.case.time,
            message: body.case.message || '',
            status: body.case.status,
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
    rdoc = await record.update(rdoc.domainId, body.rid, $set, $push);
    bus.broadcast('record/change', rdoc!, $set, $push);
}

export async function end(body: JudgeResultBody) {
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
    if (body.score !== undefined) $set.score = body.score;
    if (body.time !== undefined) $set.time = body.time;
    if (body.memory !== undefined) $set.memory = body.memory;
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
                file, false, 'judge',
            );
        }
        this.response.body.links = links;
    }
}

class JudgeConnectionHandler extends ConnectionHandler {
    processing: any = null;
    closed = false;
    query: any = { type: 'judge' };
    ip: string;

    async prepare() {
        const xff = system.get('server.xff');
        this.ip = xff ? this.request.headers[xff] || this.request.ip : this.request.ip;
        logger.info('Judge daemon connected from ', this.ip);
        this.send({ language: setting.langs });
        this.sendLanguageConfig = this.sendLanguageConfig.bind(this);
        bus.on('system/setting', this.sendLanguageConfig);
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
        if (msg.key !== 'ping') logger[['status', 'next'].includes(msg.key) ? 'debug' : 'info']('%o', msg);
        if (msg.key === 'next') await next(msg);
        else if (msg.key === 'end') {
            await end({ judger: this.user._id, ...msg }).catch((e) => logger.error(e));
            this.processing = null;
            await this.newTask();
        } else if (msg.key === 'status') {
            await updateJudge(msg.info);
        } else if (msg.key === 'prio') {
            this.query.priority = { $gt: msg.prio };
        }
    }

    async cleanup() {
        logger.info('Judge daemon disconnected from ', this.ip);
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
    Connection('judge_conn', '/judge/conn', JudgeConnectionHandler, builtin.PRIV.PRIV_JUDGE);
}

apply.next = next;
apply.end = end;

global.Hydro.handler.judge = apply;
