import { ObjectID } from 'mongodb';
import { JudgeResultBody, Rdoc, TestCase } from '../interface';
import * as record from '../model/record';
import * as problem from '../model/problem';
import * as builtin from '../model/builtin';
import * as contest from '../model/contest';
import * as domain from '../model/domain';
import * as task from '../model/task';
import * as bus from '../service/bus';
import {
    Route, Handler, Connection, ConnectionHandler,
} from '../service/server';

async function _postJudge(rdoc: Rdoc) {
    const accept = rdoc.status === builtin.STATUS.STATUS_ACCEPTED;
    const tasks = [];
    if (rdoc.contest) {
        tasks.push(
            contest.updateStatus(
                rdoc.domainId, rdoc.contest.tid, rdoc.uid,
                rdoc._id, rdoc.pid, accept, rdoc.score, rdoc.contest.type,
            ),
        );
    }
    if (await problem.updateStatus(rdoc.domainId, rdoc.pid, rdoc.uid, rdoc._id, rdoc.status)) {
        if (accept && !rdoc.rejudged) {
            tasks.push(
                problem.inc(rdoc.domainId, rdoc.pid, 'nAccept', 1),
                domain.incUserInDomain(rdoc.domainId, rdoc.uid, 'nAccept', 1),
            );
        }
    }
    await Promise.all(tasks);
}

export async function next(body: JudgeResultBody) {
    if (body.rid) body.rid = new ObjectID(body.rid);
    let rdoc = await record.get(body.domainId, body.rid);
    const $set: Partial<Rdoc> = {};
    const $push: any = {};
    if (body.case) {
        const c: TestCase = {
            memory: body.case.memory,
            time: body.case.time,
            message: body.case.message,
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
    if (body.score) $set.score = body.score;
    if (body.time) $set.time = body.time;
    if (body.memory) $set.memory = body.memory;
    if (body.progress) $set.progress = body.progress;
    rdoc = await record.update(body.domainId, body.rid, $set, $push);
    bus.boardcast('record/change', rdoc, $set, $push);
}

export async function end(body: JudgeResultBody) {
    if (body.rid) body.rid = new ObjectID(body.rid);
    let rdoc = await record.get(body.domainId, body.rid);
    const $set: Partial<Rdoc> = {};
    const $push: any = {};
    const $unset: { progress: '' } = { progress: '' };
    if (body.message) {
        rdoc.judgeTexts.push(body.message);
        $push.judgeTexts = body.message;
    }
    if (body.compilerText) {
        rdoc.compilerTexts.push(body.compilerText);
        $push.compilerTexts = body.compilerText;
    }
    if (body.status) $set.status = body.status;
    if (body.score) $set.score = body.score;
    if (body.time) $set.time = body.time;
    if (body.memory) $set.memory = body.memory;
    $set.judgeAt = new Date();
    $set.judger = body.judger;
    rdoc = await record.update(body.domainId, body.rid, $set, $push, $unset);
    await _postJudge(rdoc);
    bus.boardcast('record/change', rdoc); // trigger a full update
}

class JudgeHandler extends Handler {
    async get({ check = false }) {
        if (check) return;
        const tasks = [];
        let t = await task.getFirst({ type: 'judge' });
        while (t) {
            tasks.push(t);
            t = await task.getFirst({ type: 'judge' }); // eslint-disable-line no-await-in-loop
        }
        this.response.body = { tasks };
    }

    async postNext() {
        await next(this.request.body);
    }

    async postEnd() {
        this.request.body.judger = this.user._id;
        await end(this.request.body);
    }
}

class JudgeConnectionHandler extends ConnectionHandler {
    processing: any;

    async message(msg) {
        if (msg.key === 'next') await next(msg);
        else if (msg.key === 'end') {
            await end({ judger: this.user._id, ...msg });
            this.processing = null;
            const t = await task.getFirst({ type: 'judge' });
            this.send({ task: t });
            this.processing = t;
        }
    }

    async cleanup() {
        if (this.processing) {
            await record.reset(this.processing.domainId, this.processing.rid, false);
            task.add(this.processing);
        }
    }
}

export async function apply() {
    Route('judge', '/judge', JudgeHandler, builtin.PRIV.PRIV_JUDGE);
    Connection('judge_conn', '/judge/conn', JudgeConnectionHandler, builtin.PRIV.PRIV_JUDGE);
}

apply.next = next;
apply.end = end;

global.Hydro.handler.judge = apply;
