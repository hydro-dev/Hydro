/* eslint-disable no-await-in-loop */
import { Logger } from 'hydrooj/src/logger';
import db from 'hydrooj/src/service/db';
import * as bus from 'hydrooj/src/service/bus';
import * as Judge from 'hydrooj/src/handler/judge';
import TaskModel from 'hydrooj/src/model/task';
import DomainModel from 'hydrooj/src/model/domain';
import ProblemModel from 'hydrooj/src/model/problem';
import { STATUS } from 'hydrooj/src/model/builtin';
import { sleep } from '@hydrooj/utils/lib/utils';
import providers from './providers/index';
import { BasicProvider, IBasicProvider, RemoteAccount } from './interface';

const coll = db.collection('vjudge');
const Pool = {};
const logger = new Logger('vjudge');
const syncing = {};

class Service {
    api: IBasicProvider;

    constructor(public Provider: BasicProvider, public account: RemoteAccount) {
        this.api = new Provider(account, async (data) => {
            await coll.updateOne({ _id: account._id }, { $set: data });
        });
        this.main();
    }

    async judge(task) {
        const next = (payload) => Judge.next({ ...payload, rid: task.rid });
        const end = (payload) => Judge.end({ ...payload, rid: task.rid });
        await next({ status: STATUS.STATUS_FETCHED });
        const rid = await this.api.submitProblem(task.target, task.lang, task.code, task, next, end);
        if (!rid) return;
        await next({ status: STATUS.STATUS_JUDGING });
        await this.api.waitForSubmission(rid, next, end);
    }

    async sync(domainId: string, resync = false) {
        let page = 1;
        let pids = await this.api.listProblem(page, resync);
        while (pids.length) {
            logger.info(`${domainId}: Syncing page ${page}`);
            for (const pid of pids) {
                if (await ProblemModel.get(domainId, pid) || syncing[`${domainId}/${pid}`]) continue;
                syncing[`${domainId}/${pid}`] = true;
                try {
                    const res = await this.api.getProblem(pid);
                    if (!res) continue;
                    const id = await ProblemModel.add(domainId, pid, res.title, res.content, 1, res.tag, false);
                    for (const key in res.files) {
                        await ProblemModel.addAdditionalFile(domainId, id, key, res.files[key]);
                    }
                    for (const key in res.data) {
                        await ProblemModel.addTestdata(domainId, id, key, res.data[key]);
                    }
                    logger.info(`${domainId}: problem ${id} sync done`);
                } finally {
                    delete syncing[`${domainId}/${pid}`];
                }
                await sleep(5000);
            }
            page++;
            pids = await this.api.listProblem(page, resync);
        }
    }

    async login() {
        const login = await this.api.ensureLogin();
        if (login) {
            logger.info(`${this.account.type}/${this.account.handle}: logged in`);
            return true;
        }
        logger.warn(`${this.account.type}/${this.account.handle}: login fail`);
        return false;
    }

    async main() {
        const res = await this.login();
        if (!res) return;
        setInterval(() => this.login(), 1 * 3600 * 1000);
        TaskModel.consume({ type: 'remotejudge', subType: this.account.type }, this.judge.bind(this), false);
        const ddocs = await DomainModel.getMulti({ mount: this.account.type }).toArray();
        for (const ddoc of ddocs) {
            if (!ddoc.syncDone) await this.sync(ddoc._id, false);
            else await this.sync(ddoc._id, true);
            await DomainModel.edit(ddoc._id, { syncDone: true });
        }
    }
}

async function loadAccounts() {
    // Only start a single daemon
    if (!global.Hydro.isFirstWorker) return;
    const accounts = await coll.find().toArray();
    for (const account of accounts) {
        if (!providers[account.type]) continue;
        Pool[`${account.type}/${account.handle}`] = new Service(providers[account.type], account);
    }
}

bus.on('app/started', loadAccounts);
