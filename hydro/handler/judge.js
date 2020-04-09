const
    { requirePerm } = require('./tools'),
    { PERM_JUDGE } = require('../permission'),
    record = require('../model/record'),
    bus = require('../service/bus'),
    queue = require('../service/queue'),
    { GET, POST } = require('../service/server');

queue.assert('judge');

GET('/judge/noop', requirePerm(PERM_JUDGE), async ctx => {
    ctx.body = {};
});
GET('/judge/fetch', requirePerm(PERM_JUDGE), async ctx => {
    let rid = await queue.get('judge', false);
    if (rid) {
        let rdoc = await record.get(rid);
        let task = {
            event: 'judge',
            rid, type: 0,
            pid: rdoc.pid,
            data: rdoc.data,
            lang: rdoc.lang,
            code: rdoc.code
        };
        ctx.body = { task };
    }
    else ctx.body = {};
});
POST('/judge/next', requirePerm(PERM_JUDGE), async ctx => {
    let body = ctx.request.body;
    let rdoc = await record.get(body.rid);
    let $set = {};
    if (body.case) {
        rdoc.testCases.push(body.case);
        $set.testCases = rdoc.testCases;
    }
    if (body.judge_text) {
        rdoc.judgeTexts.push(body.judge_text);
        $set.judgeTexts = rdoc.judgeTexts;
    }
    if (body.compiler_text) {
        rdoc.compilerTexts.push(body.compilerTexts);
        $set.compilerTexts = rdoc.compilerTexts;
    }
    if (body.status) $set.status = body.status;
    if (body.score) $set.score = body.score;
    if (body.time_ms) $set.time = body.time_ms;
    if (body.memory_kb) $set.memory = body.memory_kb;
    rdoc = await record.update(body.rid, $set);
    bus.publish('record_change', rdoc);
    ctx.body = {};
});
POST('/judge/end', requirePerm(PERM_JUDGE), async ctx => {
    let body = ctx.request.body;
    let rdoc = await record.get(body.rid);
    let $set = {};
    if (body.case) {
        rdoc.testCases.push(body.case);
        $set.testCases = rdoc.testCases;
    }
    if (body.judge_text) {
        rdoc.judgeTexts.push(body.judge_text);
        $set.judgeTexts = rdoc.judgeTexts;
    }
    if (body.compiler_text) {
        rdoc.compilerTexts.push(body.compilerTexts);
        $set.compilerTexts = rdoc.compilerTexts;
    }
    if (body.status) $set.status = body.status;
    if (body.score) $set.score = body.score;
    if (body.time_ms) $set.time = body.time_ms;
    if (body.memory_kb) $set.memory = body.memory_kb;
    $set.judgeAt = new Date();
    $set.judger = ctx.state.user._id;
    rdoc = await record.update(body.rid, $set);
    bus.publish('record_change', rdoc);
    ctx.body = {};
});
