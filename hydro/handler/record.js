const
    { constants } = require('../options'),
    { PERM_READ_RECORD_CODE, PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD,
        PERM_REJUDGE, PERM_VIEW_PROBLEM_HIDDEN } = require('../permission'),
    problem = require('../model/problem'),
    record = require('../model/record'),
    user = require('../model/user'),
    bus = require('../service/bus'),
    queue = require('../service/queue'),
    { Route, Handler, Connection, ConnectionHandler } = require('../service/server');

class RecordListHandler extends Handler {
    async get({ page = 1 }) {
        this.response.template = 'record_main.html';
        let q = {};
        let rdocs = await record.getMany(q, { _id: -1 }, page, constants.RECORD_PER_PAGE);
        let pdict = {}, udict = {};
        for (let rdoc of rdocs) {
            udict[rdoc.uid] = await user.getById(rdoc.uid);
            pdict[rdoc.pid] = await problem.get({ pid: rdoc.pid, uid: this.user._id });
        }
        this.response.body = {
            path: [
                ['Hydro', '/'],
                ['record_main', null]
            ],
            page, rdocs, pdict, udict
        };
    }
}
class RecordDetailHandler extends Handler {
    async get({ rid }) {
        this.response.template = 'record_detail.html';
        let rdoc = await record.get(rid);
        if (rdoc.hidden) this.checkPerm(PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD);
        if (rdoc.uid != this.user.uid && !this.user.hasPerm(PERM_READ_RECORD_CODE)) rdoc.code = null;
        this.response.body = {
            path: [
                ['Hydro', '/'],
                ['record_detail', null]
            ],
            rdoc, show_status: true
        };
    }
}
class RecordRejudgeHandler extends Handler {
    async post({ rid }) {
        this.checkPerm(PERM_REJUDGE);
        let rdoc = await record.get(rid);
        if (rdoc) {
            await record.reset(rid);
            await queue.push('judge', rid);
        }
        this.response.back();
    }
}
class RecordConnectionHandler extends ConnectionHandler {
    async prepare() {
        bus.subscribe(['record_change'], this.onRecordChange);
    }
    async message(msg) {
        for (let rid of msg.rids) {
            let rdoc = await record.get(rid);
            await this.onRecordChange({ value: rdoc });
        }
    }
    async cleanup() {
        bus.unsubscribe(['record_change'], this.onRecordChange);
    }
    async onRecordChange(data) {
        let rdoc = data.value;
        if (rdoc.tid && rdoc.tid.toString() != this.tid) return;
        let [udoc, pdoc] = await Promise.all([user.getById(rdoc.uid), problem.get({ pid: rdoc.pid })]);
        if (pdoc.hidden && !this.user.hasPerm(PERM_VIEW_PROBLEM_HIDDEN)) pdoc = null;
        this.send({ html: await this.renderHTML('record_main_tr.html', { rdoc, udoc, pdoc }) });
    }
}
class RecordDetailConnectionHandler extends ConnectionHandler {
    async prepare({ rid }) {
        let rdoc = await record.get(rid);
        if (rdoc.tid)
            if (!await this.rdocContestVisible(rdoc)) {
                this.close();
                return;
            }
        this.rid = rid;
        bus.subscribe(['record_change'], this.onRecordChange);
        this.onRecordChange({ value: rdoc });
    }
    async onRecordChange(data) {
        let rdoc = data.value;
        if (rdoc._id.toString() != this.rid) return;
        this.send({
            status_html: await this.renderHTML('record_detail_status.html', { rdoc }),
            summary_html: await this.renderHTML('record_detail_summary.html', { rdoc })
        });
    }
    async cleanup() {
        bus.unsubscribe(['record_change'], this.onRecordChange);
    }
}

Route('/r', RecordListHandler);
Route('/r/:rid', RecordDetailHandler);
Route('/r/:rid/rejudge', RecordRejudgeHandler);
Connection('/record-conn', RecordConnectionHandler);
Connection('/record-detail-conn', RecordDetailConnectionHandler);
