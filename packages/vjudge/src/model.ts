/* eslint-disable no-await-in-loop */
import { Logger } from 'hydrooj/dist/logger';
import db from 'hydrooj/dist/service/db';
import * as bus from 'hydrooj/dist/service/bus';
import * as Judge from 'hydrooj/dist/handler/judge';
import TaskModel from 'hydrooj/dist/model/task';
import DomainModel from 'hydrooj/dist/model/domain';
import ProblemModel from 'hydrooj/dist/model/problem';
import { sleep } from '@hydrooj/utils/lib/utils';
import providers from './providers/index';
import { BasicProvider, IBasicProvider, RemoteAccount } from './interface';

const coll = db.collection('vjudge');
const Pool = {};
const logger = new Logger('vjudge');

class Service {
    api: IBasicProvider;

    constructor(public Provider: BasicProvider, public account: RemoteAccount) {
        this.api = new Provider(account, async (data) => {
            await coll.updateOne({ _id: account._id }, { $set: data });
        });
        this.main();
    }

    async judge(task) {
        const rid = await this.api.submitProblem(task.target, task.lang, task.code);
        const next = (payload) => Judge.next({ ...payload, rid: task.rid });
        const end = (payload) => Judge.end({ ...payload, rid: task.rid });
        await this.api.waitForSubmission(rid, next, end);
    }

    async sync(domainId: string) {
        let page = 1;
        let pids = await this.api.listProblem(page);
        while (pids.length) {
            logger.info(`${domainId}: Syncing page ${page}`);
            for (const pid of pids) {
                if (await ProblemModel.get(domainId, pid)) continue;
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
                await sleep(5000);
            }
            page++;
            pids = await this.api.listProblem(page);
        }
    }

    async main() {
        const login = await this.api.ensureLogin();
        if (login) logger.info(`${this.account.type}/${this.account.handle}: logged in`);
        else return;
        TaskModel.consume({ type: 'remotejudge', subType: this.account.type }, this.judge.bind(this));
        const ddocs = await DomainModel.getMulti({ mount: this.account.type }).toArray();
        for (const ddoc of ddocs) await this.sync(ddoc._id);
    }
}

async function loadAccounts() {
    const accounts = await coll.find().toArray();
    for (const account of accounts) {
        if (!providers[account.type]) continue;
        Pool[`${account.type}/${account.handle}`] = new Service(providers[account.type], account);
    }
}

bus.on('app/started', loadAccounts);
