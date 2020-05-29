const {
    PERM_READ_RECORD_CODE, PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD,
    PERM_REJUDGE, PERM_VIEW_PROBLEM_HIDDEN,
} = require('../permission');
const problem = require('../model/problem');
const record = require('../model/record');
const contest = require('../model/contest');
const system = require('../model/system');
const user = require('../model/user');
const bus = require('../service/bus');
const {
    Route, Handler, Connection, ConnectionHandler,
} = require('../service/server');

class RecordListHandler extends Handler {
    async get({ domainId, page = 1 }) {
        this.response.template = 'record_main.html';
        const q = {};
        const rdocs = await record.getMany(domainId, q, { _id: -1 }, page, await system.get('RECORD_PER_PAGE'));
        const [udict, pdict] = await Promise.all([
            user.getList(domainId, rdocs.map((rdoc) => rdoc.uid)),
            problem.getList(domainId, rdocs.map((rdoc) => rdoc.pid)),
        ]);
        const path = [
            ['Hydro', '/'],
            ['record_main', null],
        ];
        this.response.body = {
            path, page, rdocs, pdict, udict,
        };
    }
}

class RecordDetailHandler extends Handler {
    async get({ domainId, rid }) {
        this.response.template = 'record_detail.html';
        const rdoc = await record.get(domainId, rid);
        if (rdoc.hidden) this.checkPerm(PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD);
        if (rdoc.uid !== this.user.uid && !this.user.hasPerm(PERM_READ_RECORD_CODE)) {
            rdoc.code = null;
        }
        const [pdoc, udoc] = await Promise.all([
            problem.get(domainId, rdoc.pid),
            user.getById(domainId, rdoc.uid),
        ]);
        this.response.body = {
            path: [
                ['Hydro', '/'],
                ['record_detail', null],
            ],
            udoc,
            rdoc,
            pdoc,
            show_status: true,
        };
    }
}

class RecordRejudgeHandler extends Handler {
    async post({ domainId, rid }) {
        this.checkPerm(PERM_REJUDGE);
        const rdoc = await record.get(domainId, rid);
        if (rdoc) await record.rejudge(domainId, rid);
        this.back();
    }
}

class RecordConnectionHandler extends ConnectionHandler {
    async prepare({ domainId }) {
        this.domainId = domainId;
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
        // eslint-disable-next-line prefer-const
        let [udoc, pdoc] = await Promise.all([
            user.getById(this.domainId, rdoc.uid),
            problem.getById(this.domainId, rdoc.pid),
        ]);
        if (pdoc.hidden && !this.user.hasPerm(PERM_VIEW_PROBLEM_HIDDEN)) pdoc = null;
        this.send({ html: await this.renderHTML('record_main_tr.html', { rdoc, udoc, pdoc }) });
    }
}

class RecordDetailConnectionHandler extends contest.ContestHandlerMixin(ConnectionHandler) {
    async prepare({ domainId, rid }) {
        const rdoc = await record.get(domainId, rid);
        if (rdoc.tid) {
            const tdoc = await contest.get(domainId, rdoc.tid);
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

async function apply() {
    Route('/r', module.exports.RecordListHandler);
    Route('/r/:rid', module.exports.RecordDetailHandler);
    Route('/r/:rid/rejudge', module.exports.RecordRejudgeHandler);
    Connection('/record-conn', module.exports.RecordConnectionHandler);
    Connection('/record-detail-conn', module.exports.RecordDetailConnectionHandler);
}

global.Hydro.handler.record = module.exports = {
    RecordListHandler,
    RecordDetailHandler,
    RecordRejudgeHandler,
    RecordConnectionHandler,
    RecordDetailConnectionHandler,
    apply,
};
