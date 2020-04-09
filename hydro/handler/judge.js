const
    { requirePerm } = require('./tools'),
    { sleep } = require('../utils'),
    { PERM_JUDGE } = require('../permission'),
    record = require('../model/record'),
    problem = require('../model/problem'),
    bus = require('../service/bus'),
    queue = require('../service/queue'),
    { GET, POST, SOCKET } = require('../service/server');

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

GET('/judge/noop', requirePerm(PERM_JUDGE), async ctx => {
    ctx.body = {};
});
GET('/judge/fetch', requirePerm(PERM_JUDGE), async ctx => {
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
        ctx.body = { task };
    }
    else ctx.body = {};
});
SOCKET('/judge/conn', [requirePerm(PERM_JUDGE)], async conn => {
    let isOpen = true, processing = null;
    conn.on('close', async () => {
        isOpen = false;
        if (processing) {
            await record.reset(processing);
            queue.push('judge', processing);
        }
    });
    conn.on('data', async message => {
        message = JSON.parse(message);
        if (message.key == 'next') await next(message);
        else if (message.key == 'end') {
            await end(Object.assign({ judger: conn.state.user._id }, message));
            processing = null;
        }
    });
    while (isOpen) {
        if (!processing) {
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
            conn.write(JSON.stringify({ task }));
            processing = task.rid;
        } else await sleep(100);
    }
});
POST('/judge/next', requirePerm(PERM_JUDGE), async ctx => {
    await next(ctx.request.body);
    ctx.body = {};
});
POST('/judge/end', requirePerm(PERM_JUDGE), async ctx => {
    await end(Object.assign({ judger: ctx.state.user._id }, ctx.request.body));
    ctx.body = {};
});
