const
    { CONTEXT } = require('../service/server'),
    queue = require('../service/queue'),
    record = require('../model/record'),
    { requirePerm } = require('./tools'),
    { PERM_JUDGE } = require('../permission');

queue.assert('judge');

const { MIDDLEWARE, GET, POST } = CONTEXT();
MIDDLEWARE(requirePerm(PERM_JUDGE));
GET('/judge/noop', async ctx => {
    ctx.body = {};
});
GET('/judge/fetch', async ctx => {
    let rid = await queue.get('judge', false);
    if (rid) {
        let rdoc = await record.get(rid);
        let data = {
            event: 'judge',
            rid, type: 0,
            pid: rdoc.pid,
            data: rdoc.data,
            lang: rdoc.lang,
            code: rdoc.code
        };
        ctx.body = data;
    }
});
POST('/judge/next', async ctx => {
    console.log(ctx.request.body);
});
POST('/judge/end', async ctx => {
    console.log(ctx.request.body);
});
