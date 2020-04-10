const
    bson = require('bson'),
    { constants } = require('../options'),
    { PERM_READ_RECORD_CODE, PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD,
        PERM_REJUDGE, PERM_VIEW_PROBLEM_HIDDEN } = require('../permission'),
    { requirePerm } = require('../handler/tools'),
    problem = require('../model/problem'),
    record = require('../model/record'),
    user = require('../model/user'),
    bus = require('../service/bus'),
    queue = require('../service/queue'),
    { GET, POST, SOCKET } = require('../service/server');

GET('/r', async ctx => {
    ctx.templateName = 'record_main.html';
    let q = {},
        page = ctx.query.page || 1;
    let rdocs = await record.getMany(q, { _id: -1 }, page, constants.RECORD_PER_PAGE);
    let pdict = {}, udict = {};
    for (let rdoc of rdocs) {
        udict[rdoc.uid] = await user.getById(rdoc.uid);
        pdict[rdoc.pid] = await problem.get({ pid: rdoc.pid, uid: ctx.state.user._id });
    }
    ctx.body = {
        path: [
            ['Hydro', '/'],
            ['record_main', null]
        ],
        page, rdocs, pdict, udict
    };
});
SOCKET('/record-conn', [], conn => {
    let tid = conn.params.tid;
    async function onRecordChange(data) {
        let rdoc = data.value;
        if (rdoc.tid && rdoc.tid.toString() != tid) return;
        let [udoc, pdoc] = await Promise.all([user.getById(rdoc.uid), problem.get({ pid: rdoc.pid })]);
        if (pdoc.hidden && !conn.state.user.hasPerm(PERM_VIEW_PROBLEM_HIDDEN)) pdoc = null;
        conn.send({ html: await conn.renderHTML('record_main_tr.html', { rdoc, udoc, pdoc }) });
    }
    bus.subscribe(['record_change'], onRecordChange);
    conn.on('data', async message => {
        console.log(message);
        let { rids } = JSON.parse(message);
        for (let rid of rids) {
            let rdoc = await record.get(rid);
            await onRecordChange({ value: rdoc });
        }
    });
    conn.on('close', () => {
        bus.unsubscribe(['record_change'], onRecordChange);
    });
});
GET('/r/:rid', async ctx => {
    ctx.templateName = 'record_detail.html';
    let uid = ctx.state.user._id, rid = new bson.ObjectID(ctx.params.rid);
    let rdoc = await record.get(rid);
    if (rdoc.hidden) ctx.checkPerm(PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD);
    if (rdoc.uid != uid && !ctx.state.user.hasPerm(PERM_READ_RECORD_CODE)) rdoc.code = null;
    ctx.body = {
        path: [
            ['Hydro', '/'],
            ['record_detail', null]
        ],
        rdoc, show_status: true
    };
});
SOCKET('/record-detail-conn', [], async conn => {
    let rdoc = await record.get(conn.params.rid);
    if (rdoc.tid)
        if (!await conn.rdoc_contest_visible(rdoc)) {
            conn.close();
            return;
        }
    async function onRecordChange(data) {
        let rdoc = data.value;
        if (rdoc._id.toString() != conn.params.rid) return;
        conn.send({
            status_html: await conn.renderHTML('record_detail_status.html', { rdoc }),
            summary_html: await conn.renderHTML('record_detail_summary.html', { rdoc })
        });
    }
    bus.subscribe(['record_change'], onRecordChange);
    onRecordChange({ value: rdoc });
    conn.on('close', () => {
        bus.unsubscribe(['record_change'], onRecordChange);
    });
});
POST('/r/:rid/rejudge', requirePerm(PERM_REJUDGE), async ctx => {
    let uid = ctx.state.user._id, rid = new bson.ObjectID(ctx.params.rid);
    let rdoc = await record.get(rid);
    if (rdoc.hidden) ctx.checkPerm(PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD);
    if (rdoc.uid != uid && !ctx.state.user.hasPerm(PERM_READ_RECORD_CODE)) rdoc.code = null;
    if (rdoc) {
        await record.reset(rid);
        await queue.push('judge', rid);
    }
    ctx.back();
});
