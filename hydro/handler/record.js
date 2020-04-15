const { constants } = require('../options');
const {
    PERM_READ_RECORD_CODE, PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD,
    PERM_REJUDGE, PERM_VIEW_PROBLEM_HIDDEN,
} = require('../permission');
const problem = require('../model/problem');
const record = require('../model/record');
const contest = require('../model/contest');
const user = require('../model/user');
const bus = require('../service/bus');
const queue = require('../service/queue');
const {
    Route, Handler, Connection, ConnectionHandler,
} = require('../service/server');

class RecordListHandler extends Handler {
    async get({ page = 1 }) {
        this.response.template = 'record_main.html';
        const q = {};
        const rdocs = await record.getMany(q, { _id: -1 }, page, constants.RECORD_PER_PAGE);
        const pdict = {};
        const udict = {};
        const ulist = [];
        const plist = [];
        for (const rdoc of rdocs) {
            ulist[rdoc.uid] = user.getById(rdoc.uid);
            plist[rdoc.pid] = problem.get(rdoc.pid, this.user._id);
        }
        await Promise.all(ulist);
        await Promise.all(plist);
        for (const udoc of ulist) {
            udict[udoc._id] = udoc;
        }
        for (const pdoc of plist) {
            pdict[pdoc._id] = pdoc;
        }
        this.response.body = {
            path: [
                ['Hydro', '/'],
                ['record_main', null],
            ],
            page,
            rdocs,
            pdict,
            udict,
        };
    }
}
class RecordDetailHandler extends Handler {
    async get({ rid }) {
        this.response.template = 'record_detail.html';
        const rdoc = await record.get(rid);
        if (rdoc.hidden) this.checkPerm(PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD);
        if (rdoc.uid !== this.user.uid && !this.user.hasPerm(PERM_READ_RECORD_CODE)) rdoc.code = null;
        this.response.body = {
            path: [
                ['Hydro', '/'],
                ['record_detail', null],
            ],
            rdoc,
            show_status: true,
        };
    }
}
class RecordRejudgeHandler extends Handler {
    async post({ rid }) {
        this.checkPerm(PERM_REJUDGE);
        const rdoc = await record.get(rid);
        if (rdoc) {
            await record.reset(rid);
            await queue.push('judge', rid);
        }
        this.back();
    }
}
class RecordConnectionHandler extends ConnectionHandler {
    async prepare() {
        bus.subscribe(['record_change'], this.onRecordChange);
    }

    async message(msg) {
        for (const rid of msg.rids) {
            const rdoc = await record.get(rid); // eslint-disable-line no-await-in-loop
            await this.onRecordChange({ value: rdoc }); // eslint-disable-line no-await-in-loop
        }
    }

    async cleanup() {
        bus.unsubscribe(['record_change'], this.onRecordChange);
    }

    async onRecordChange(data) {
        const rdoc = data.value;
        if (rdoc.tid && rdoc.tid.toString() !== this.tid) return;
        let [udoc, pdoc] = await Promise.all([user.getById(rdoc.uid), problem.getById(rdoc.pid)]);
        if (pdoc.hidden && !this.user.hasPerm(PERM_VIEW_PROBLEM_HIDDEN)) pdoc = null;
        this.send({ html: await this.renderHTML('record_main_tr.html', { rdoc, udoc, pdoc }) });
    }
}
class RecordDetailConnectionHandler extends contest.ContestHandlerMixin(ConnectionHandler) {
    async prepare({ rid }) {
        const rdoc = await record.get(rid);
        if (rdoc.tid) {
            const tdoc = await contest.get(rdoc.tid);
            if (!this.canShowRecord(tdoc)) {
                this.close();
                return;
            }
        }
        this.rid = rid;
        bus.subscribe(['record_change'], this.onRecordChange);
        this.onRecordChange({ value: rdoc });
    }

    async onRecordChange(data) {
        const rdoc = data.value;
        if (rdoc._id.toString() !== this.rid) return;
        this.send({
            status_html: await this.renderHTML('record_detail_status.html', { rdoc }),
            summary_html: await this.renderHTML('record_detail_summary.html', { rdoc }),
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
