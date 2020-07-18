import yaml from 'js-yaml';
import { ObjectID } from 'mongodb';
import { parseTimeMS, parseMemoryMB } from '../utils';
import { JudgeResultBody, Rdoc } from '../interface';
import * as record from '../model/record';
import * as problem from '../model/problem';
import * as builtin from '../model/builtin';
import * as contest from '../model/contest';
import * as domain from '../model/domain';
import * as task from '../model/task';
import * as bus from '../service/bus';
import {
    Route, Handler, Connection, ConnectionHandler, Types, param,
} from '../service/server';

interface _PostJudgeBody {
    status: number,
    domainId: string,
    uid: number,
    _id: ObjectID,
    pid: number,
    score: number,
    rejudged: boolean,
}

interface PostJudgeBodyContest extends _PostJudgeBody {
    tid: ObjectID,
    ttype: number,
}

type PostJudgeBody = _PostJudgeBody | PostJudgeBodyContest;

function _isWithContest(v: PostJudgeBody): v is PostJudgeBodyContest {
    return !!((v as PostJudgeBodyContest).tid);
}

async function _postJudge(rdoc: PostJudgeBody) {
    const accept = rdoc.status === builtin.STATUS.STATUS_ACCEPTED;
    const tasks = [];
    if (_isWithContest(rdoc)) {
        tasks.push(
            contest.updateStatus(
                rdoc.domainId, rdoc.tid, rdoc.uid,
                rdoc._id, rdoc.pid, accept, rdoc.score, rdoc.ttype,
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
    if (body.tid) body.tid = new ObjectID(body.tid);
    let rdoc = await record.get(body.domainId, body.rid);
    const $set: any = {};
    const $push: any = {};
    if (body.case) {
        const c: any = {};
        c.memory = body.case.memory;
        c.time = body.case.time;
        c.message = body.case.message;
        c.status = body.case.status;
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
    bus.publish('record_change', { rdoc, $set, $push });
}

export async function end(body: JudgeResultBody) {
    if (body.rid) body.rid = new ObjectID(body.rid);
    if (body.tid) body.tid = new ObjectID(body.tid);
    let rdoc = await record.get(body.domainId, body.rid);
    const $set: any = {};
    const $push: any = {};
    const $unset = { progress: '' };
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
    if (body.stdout) $set.stdout = body.stdout;
    if (body.stderr) $set.stderr = body.stderr;
    if (body.time) $set.time = body.time;
    if (body.memory) $set.memory = body.memory;
    $set.judgeAt = new Date();
    $set.judger = body.judger;
    rdoc = await record.update(body.domainId, body.rid, $set, $push, $unset);
    await _postJudge(rdoc);
    bus.publish('record_change', { rdoc }); // trigger a full update
}

class PretestHandler extends Handler {
    @param('pid', Types.UnsignedInt, true)
    @param('code', Types.String)
    @param('lang', Types.String)
    @param('time', Types.String, true)
    @param('memory', Types.String, true)
    @param('input', Types.String, true)
    async post(
        domainId: string, pid = 0,
        code: string, lang: string,
        time = '1s', memory = '256m', input = '',
    ) {
        if (pid) {
            const pdoc = await problem.get(domainId, pid);
            if (pdoc.config) {
                const config: any = yaml.safeLoad(pdoc.config);
                if (config.time) time = config.time;
                if (config.memory) memory = config.memory;
            }
        }
        const rid = await record.add(domainId, {
            pid,
            uid: this.user._id,
            type: 'run',
            time: parseTimeMS(time),
            memory: parseMemoryMB(memory),
            input,
            lang,
            code,
            hidden: true,
        }, true);
        this.response.body = { rid };
        this.response.redirect = this.url('record_detail', { rid });
    }
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
    Route('pretest', '/pretest', PretestHandler);
    Route('judge', '/judge', JudgeHandler, builtin.PRIV.PRIV_JUDGE);
    Connection('judge_conn', '/judge/conn', JudgeConnectionHandler, builtin.PRIV.PRIV_JUDGE);
}

apply.next = next;
apply.end = end;

global.Hydro.handler.judge = apply;
