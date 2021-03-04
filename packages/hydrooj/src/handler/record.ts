import { FilterQuery, ObjectID } from 'mongodb';
import { PermissionError, RecordNotFoundError } from '../error';
import { PERM, STATUS, PRIV } from '../model/builtin';
import * as system from '../model/system';
import * as problem from '../model/problem';
import * as record from '../model/record';
import * as contest from '../model/contest';
import * as user from '../model/user';
import paginate from '../lib/paginate';
import * as bus from '../service/bus';
import {
    Route, Handler, Connection, ConnectionHandler, Types, param,
} from '../service/server';
import { Rdoc } from '../interface';

const RecordHandler = contest.ContestHandlerMixin(Handler);

class RecordListHandler extends RecordHandler {
    @param('page', Types.PositiveInt, true)
    @param('pid', Types.String, true)
    @param('tid', Types.ObjectID, true)
    @param('uidOrName', Types.String, true)
    @param('allDomain', Types.Boolean, true)
    async get(domainId: string, page = 1, pid?: string, tid?: ObjectID, uidOrName?: string, all = false) {
        this.response.template = 'record_main.html';
        const q: FilterQuery<Rdoc> = { 'contest.tid': tid, hidden: false };
        if (uidOrName) {
            let udoc = await user.getById(domainId, +uidOrName);
            if (udoc) q.uid = udoc._id;
            else {
                udoc = await user.getByUname(domainId, uidOrName);
                if (udoc) q.uid = udoc._id;
                else q.uid = null;
            }
        }
        if (pid) {
            const pdoc = await problem.get(domainId, pid);
            if (pdoc) q.pid = pdoc.docId;
            else q.pid = null;
        }
        const [rdocs] = await paginate(
            record.getMulti(domainId, q).sort('_id', -1),
            page,
            system.get('pagination.record'),
        );
        const canViewProblem = this.user.hasPerm(PERM.PERM_VIEW_PROBLEM);
        const canViewProblemHidden = this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN);
        const [udict, pdict] = await Promise.all([
            user.getList(domainId, rdocs.map((rdoc) => rdoc.uid)),
            canViewProblem
                ? problem.getList(domainId, rdocs.map((rdoc) => rdoc.pid), canViewProblemHidden, false)
                : Object.fromEntries([rdocs.map((rdoc) => [rdoc.pid, problem.Pdoc.create(rdoc.pid, rdoc.pid)])]),
        ]);
        const path = [
            ['Hydro', 'homepage'],
            ['record_main', null],
        ];
        this.response.body = {
            path,
            page,
            rdocs,
            pdict,
            udict,
            filterPid: pid,
            filterTid: tid,
            filterUidOrName: uidOrName,
        };
        if (this.user.hasPriv(PRIV.PRIV_VIEW_JUDGE_STATISTICS)) {
            this.response.body.statistics = await record.stat(all ? undefined : domainId);
        }
    }
}

class RecordDetailHandler extends RecordHandler {
    @param('rid', Types.ObjectID)
    async get(domainId: string, rid: ObjectID) {
        this.response.template = 'record_detail.html';
        const rdoc = await record.get(domainId, rid);
        if (!rdoc) throw new RecordNotFoundError(rid);
        if (rdoc.contest) {
            const tdoc = await contest.get(domainId, rdoc.contest.tid, rdoc.contest.type);
            if (!this.canShowRecord(tdoc, true)) throw new PermissionError(rid);
        }
        if (rdoc.uid !== this.user._id && !this.user.hasPerm(PERM.PERM_READ_RECORD_CODE)) rdoc.code = null;
        // eslint-disable-next-line prefer-const
        let [pdoc, udoc] = await Promise.all([
            problem.get(domainId, rdoc.pid),
            user.getById(domainId, rdoc.uid),
        ]);
        if (!(pdoc && this.user.hasPerm(PERM.PERM_VIEW_PROBLEM))) {
            pdoc = problem.Pdoc.create(pdoc?.docId || 0, pdoc?.pid || '*');
        }
        if (!rdoc.contest && pdoc.hidden && pdoc.owner !== this.user._id) {
            if (!this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN)) {
                pdoc = problem.Pdoc.create(pdoc.docId, pdoc.pid);
            }
        }
        this.response.body = {
            path: [
                ['Hydro', 'homepage'],
                ['record_detail', null],
            ],
            udoc,
            rdoc,
            pdoc,
        };
    }

    @param('rid', Types.ObjectID)
    async postRejudge(domainId: string, rid: ObjectID) {
        this.checkPerm(PERM.PERM_REJUDGE);
        const rdoc = await record.get(domainId, rid);
        if (rdoc) {
            await record.reset(domainId, rid, true);
            await record.judge(domainId, rid, 0);
        }
        this.back();
    }

    @param('rid', Types.ObjectID)
    async postCancel(domainId: string, rid: ObjectID) {
        const rdoc = await record.get(domainId, rid);
        if (rdoc) {
            const $set = {
                status: STATUS.STATUS_CANCELED,
                score: 0,
                time: 0,
                memory: 0,
                testCases: [{
                    status: 9, score: 0, time: 0, memory: 0, message: 'score canceled',
                }],
            };
            await Promise.all([
                record.update(domainId, rid, $set),
                bus.emit('record/change', rdoc, $set),
            ]);
        }
        this.back();
    }
}

const RecordConnectionHandler = contest.ContestHandlerMixin(ConnectionHandler);

class RecordMainConnectionHandler extends RecordConnectionHandler {
    dispose: bus.Disposable;

    @param('tid', Types.ObjectID, true)
    async prepare(domainId: string, tid?: ObjectID) {
        this.domainId = domainId;
        if (tid) {
            const tdoc = await contest.get(domainId, tid, -1);
            if (this.canShowRecord(tdoc)) this.tid = tid.toHexString();
            else {
                this.close();
                return;
            }
        }
        this.dispose = bus.on('record/change', this.onRecordChange.bind(this));
    }

    async message(msg) {
        if (msg.rids instanceof Array) {
            const rids = msg.rids.map((id: string) => new ObjectID(id));
            const rdocs = await record.getMulti(
                this.domainId, { _id: { $in: rids } },
            ).toArray();
            for (const rdoc of rdocs) {
                this.onRecordChange(rdoc);
            }
        }
    }

    async cleanup() {
        if (this.dispose) this.dispose();
    }

    async onRecordChange(rdoc: Rdoc) {
        if (rdoc.input) return;
        if (rdoc.contest && rdoc.contest.tid.toString() !== this.tid) return;
        if (rdoc.domainId !== this.domainId) return;
        // eslint-disable-next-line prefer-const
        let [udoc, pdoc] = await Promise.all([
            user.getById(this.domainId, rdoc.uid),
            problem.get(this.domainId, rdoc.pid, null),
        ]);
        if (pdoc) {
            if (pdoc.hidden && !this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN)) pdoc = null;
            if (!this.user.hasPerm(PERM.PERM_VIEW_PROBLEM)) pdoc = null;
        }
        this.send({ html: await this.renderHTML('record_main_tr.html', { rdoc, udoc, pdoc }) });
    }
}

class RecordDetailConnectionHandler extends contest.ContestHandlerMixin(ConnectionHandler) {
    dispose: bus.Disposable;

    @param('rid', Types.ObjectID)
    async prepare(domainId: string, rid: ObjectID) {
        const rdoc = await record.get(domainId, rid);
        if (rdoc.contest) {
            const tdoc = await contest.get(domainId, rdoc.contest.tid, -1);
            if (!this.canShowRecord(tdoc)) {
                this.close();
                return;
            }
        }
        this.rid = rid.toString();
        this.dispose = bus.on('record/change', this.onRecordChange.bind(this));
        this.onRecordChange(rdoc);
    }

    async onRecordChange(rdoc: Rdoc, $set?: any, $push?: any) {
        if (rdoc._id.toString() !== this.rid) return;
        if ($set) this.send({ $set, $push });
        else {
            this.send({
                status_html: await this.renderHTML('record_detail_status.html', { rdoc }),
                summary_html: await this.renderHTML('record_detail_summary.html', { rdoc }),
            });
        }
    }

    async cleanup() {
        if (this.dispose) this.dispose();
    }
}

export async function apply() {
    Route('record_main', '/record', RecordListHandler);
    Route('record_detail', '/record/:rid', RecordDetailHandler);
    Connection('record_conn', '/record-conn', RecordMainConnectionHandler);
    Connection('record_detail_conn', '/record-detail-conn', RecordDetailConnectionHandler);
}

global.Hydro.handler.record = apply;
