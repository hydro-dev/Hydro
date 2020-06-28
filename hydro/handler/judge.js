const yaml = require('js-yaml');
const { PERM_JUDGE } = require('../permission');
const { parseTimeMS, parseMemoryMB } = require('../utils');
const record = require('../model/record');
const problem = require('../model/problem');
const builtin = require('../model/builtin');
const contest = require('../model/contest');
const user = require('../model/user');
const task = require('../model/task');
const bus = require('../service/bus');
const {
    Route, Handler, Connection, ConnectionHandler,
} = require('../service/server');

async function _postJudge(rdoc) {
    const accept = rdoc.status === builtin.STATUS_ACCEPTED;
    bus.publish('record_change', rdoc);
    if (rdoc.type === 'run') return;
    const tasks = [];
    if (rdoc.tid) {
        tasks.push(
            contest.updateStatus(
                rdoc.domainId, rdoc.tid, rdoc.uid,
                rdoc._id, rdoc.pid, accept, rdoc.score, rdoc.ttype,
            ),
        );
    }
    if (await problem.updateStatus(rdoc.pid, rdoc.uid, rdoc._id, rdoc.status)) {
        if (accept && !rdoc.rejudged) {
            tasks.push(
                problem.inc(rdoc.domainId, rdoc.pid, 'nAccept', 1),
                user.incDomain(rdoc.domainId, rdoc.uid, 'nAccept', 1),
            );
        }
    }
    await Promise.all(tasks);
}

async function next(body) {
    let rdoc = await record.get(body.domainId, body.rid);
    const $set = {};
    const $push = {};
    if (body.case) {
        const c = {};
        c.memory = body.case.memory_kb || body.case.memory;
        c.time = body.case.time_ms || body.case.time;
        c.judgeText = body.case.judge_text || body.case.judgeText || body.case.message;
        c.status = body.case.status;
        rdoc.testCases.push(c);
        $push.testCases = c;
    }
    if (body.judge_text || body.message) {
        rdoc.judgeTexts.push(body.judge_text || body.message);
        $push.judgeTexts = body.judge_text || body.message;
    }
    if (body.compiler_text) {
        rdoc.compilerTexts.push(body.compiler_text);
        $push.compilerTexts = body.compiler_text;
    }
    if (body.status) $set.status = body.status;
    if (body.score) $set.score = body.score;
    if (body.time_ms) $set.time = body.time_ms || body.time;
    if (body.memory_kb) $set.memory = body.memory_kb || body.memory;
    if (body.progress) $set.progress = body.progress;
    rdoc = await record.update(body.domainId, body.rid, $set, $push);
    bus.publish('record_change', rdoc);
}

async function end(body) {
    let rdoc = await record.get(body.domainId, body.rid);
    const $set = {};
    const $push = {};
    const $unset = { progress: '' };
    if (body.judge_text) {
        rdoc.judgeTexts.push(body.judge_text);
        $push.judgeTexts = body.judge_text;
    }
    if (body.compiler_text) {
        rdoc.compilerTexts.push(body.compiler_text);
        $push.compilerTexts = body.compiler_text;
    }
    if (body.status) $set.status = body.status;
    if (body.score) $set.score = body.score;
    if (body.stdout) $set.stdout = body.stdout;
    if (body.stderr) $set.stderr = body.stderr;
    if (body.time_ms) $set.time = body.time_ms;
    if (body.memory_kb) $set.memory = body.memory_kb;
    $set.judgeAt = new Date();
    $set.judger = body.judger;
    rdoc = await record.update(body.domainId, body.rid, $set, $push, $unset);
    await _postJudge(rdoc);
    rdoc = await record.update(body.domainId, body.rid, $set, $push);
}

class PretestHandler extends Handler {
    async post({
        domainId, pid, code, lang, time = '1s', memory = '256m', input = '',
    }) {
        if (pid) {
            const pdoc = await problem.get(domainId, pid);
            if (pdoc.config) {
                const config = yaml.safeLoad(pdoc.config);
                if (config.time) time = config.time;
                if (config.memory) memory = config.memory;
            }
        }
        const rid = await record.add(domainId, {
            pid: pid || String.random(16),
            uid: this.user._id,
            type: 'run',
            time: parseTimeMS(time),
            memory: parseMemoryMB(memory),
            input,
            lang,
            code,
            hidden: true,
        });
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
            await record.reset(this.processing);
            task.add(this.processing);
        }
    }
}

async function apply() {
    Route('pretest', '/pretest', PretestHandler);
    Route('judge', '/judge', JudgeHandler, PERM_JUDGE);
    Connection('judge_conn', '/judge/conn', JudgeConnectionHandler, PERM_JUDGE);
}

apply.next = next;
apply.end = end;

global.Hydro.handler.judge = module.exports = apply;
