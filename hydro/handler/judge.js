const
    { PERM_JUDGE } = require('../permission'),
    record = require('../model/record'),
    problem = require('../model/problem'),
    bus = require('../service/bus'),
    queue = require('../service/queue'),
    { Route, Handler, Connection, ConnectionHandler } = require('../service/server');

queue.assert('judge');

async function next(body) {
    let rdoc = await record.get(body.rid);
    let $set = {};
    if (body.case) {
        rdoc.cases.push(body.case);
        $set.cases = rdoc.cases;
    }
    if (body.judge_text) {
        rdoc.judgeTexts.push(body.judge_text);
        $set.judgeTexts = rdoc.judgeTexts;
    }
    if (body.compiler_text) {
        rdoc.compilerTexts.push(body.compiler_text);
        $set.compilerTexts = rdoc.compilerTexts;
    }
    if (body.status) $set.status = body.status;
    if (body.score) $set.score = body.score;
    if (body.time_ms) $set.time = body.time_ms;
    if (body.memory_kb) $set.memory = body.memory_kb;
    rdoc = await record.update(body.rid, $set);
    bus.publish('record_change', rdoc);
}
async function end(body) {
    let rdoc = await record.get(body.rid);
    let $set = {};
    if (body.case) {
        rdoc.cases.push(body.case);
        $set.cases = rdoc.cases;
    }
    if (body.judge_text) {
        rdoc.judgeTexts.push(body.judge_text);
        $set.judgeTexts = rdoc.judgeTexts;
    }
    if (body.compiler_text) {
        rdoc.compilerTexts.push(body.compiler_text);
        $set.compilerTexts = rdoc.compilerTexts;
    }
    if (body.status) $set.status = body.status;
    if (body.score) $set.score = body.score;
    if (body.time_ms) $set.time = body.time_ms;
    if (body.memory_kb) $set.memory = body.memory_kb;
    $set.judgeAt = new Date();
    $set.judger = body.judger;
    rdoc = await record.update(body.rid, $set);
    bus.publish('record_change', rdoc);
}

class JudgeHandler extends Handler {
    async prepare() {
        this.checkPerm(PERM_JUDGE);
    }
    async get({ check = false }) {
        this.response.body = {};
        if (check) return;
        let rid = await queue.get('judge', false);
        if (rid) {
            let rdoc = await record.get(rid);
            let pdoc = await problem.getById(rdoc.pid);
            let task = {
                event: 'judge',
                rid, type: 0,
                pid: rdoc.pid,
                data: pdoc.data,
                lang: rdoc.lang,
                code: rdoc.code
            };
            this.response.body = { task };
        }
    }
    async post_next() {
        await next(this.request.body);
        this.response.body = {};
    }
    async post_end() {
        await end(this.request.body);
        this.response.body = {};
    }
}
class JudgeConnectionHandler extends ConnectionHandler {
    async prepare() {
        this.checkPerm(PERM_JUDGE);
    }
    async message(msg) {
        if (msg.key == 'next') await next(msg);
        else if (msg.key == 'end') {
            await end({ judger: this.user._id, ...msg });
            this.processing = null;
            let rid = await queue.get('judge');
            let rdoc = await record.get(rid);
            let pdoc = await problem.getById(rdoc.pid);
            let task = {
                event: 'judge',
                rid, type: 0,
                pid: rdoc.pid,
                data: pdoc.data,
                lang: rdoc.lang,
                code: rdoc.code
            };
            this.send({ task });
            this.processing = task.rid;
        }
    }
    async cleanup() {
        if (this.processing) {
            await record.reset(this.processing);
            queue.push('judge', this.processing);
        }
    }
}

Route('/judge', JudgeHandler);
Connection('/judge/conn', JudgeConnectionHandler);
