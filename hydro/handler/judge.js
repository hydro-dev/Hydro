const { PERM_JUDGE } = require('../permission');
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
    const tasks = [];
    if (rdoc.tid) {
        tasks.push(
            contest.updateStatus(rdoc.domainId, rdoc.tid, rdoc.uid, rdoc._id, rdoc.pid, accept, rdoc.score),
        );
    }
    if (await problem.updateStatus(rdoc.rdoc.pid, rdoc.uid, rdoc._id, rdoc.status)) {
        if (accept && !rdoc.rejudged) {
            tasks.push(
                problem.inc(rdoc.domainId, rdoc.pid, 'nAccept', 1),
                user.inc(rdoc.domainId, rdoc.uid, 'nAccept', 1),
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
        rdoc.testCases.push(body.case);
        $push.testCases = body.case;
    }
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
    if (body.time_ms) $set.time = body.time_ms;
    if (body.memory_kb) $set.memory = body.memory_kb;
    rdoc = await record.update(body.domainId, body.rid, $set, $push);
    bus.publish('record_change', rdoc);
}

async function end(body) {
    let rdoc = await record.get(body.domainId, body.rid);
    const $set = {};
    const $push = {};
    if (body.case) {
        rdoc.testCases.push(body.case);
        $push.testCases = body.case;
    }
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
    if (body.time_ms) $set.time = body.time_ms;
    if (body.memory_kb) $set.memory = body.memory_kb;
    $set.judgeAt = new Date();
    $set.judger = body.judger;
    rdoc = await record.update(body.domainId, body.rid, $set, $push);
    await _postJudge(rdoc);
    rdoc = await record.update(body.domainId, body.rid, $set, $push);
}

class JudgeHandler extends Handler {
    async prepare() {
        this.checkPerm(PERM_JUDGE);
    }

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
    async prepare() {
        this.checkPerm(PERM_JUDGE);
    }

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
    Route('/judge', module.exports.JudgeHandler);
    Connection('/judge/conn', module.exports.JudgeConnectionHandler);
}

global.Hydro.handler.judge = module.exports = {
    JudgeHandler, JudgeConnectionHandler, apply, next, end,
};
