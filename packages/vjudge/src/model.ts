/* eslint-disable no-await-in-loop */
import os from 'os';
import {
    Context, db, DomainModel, JudgeHandler, Logger,
    ProblemModel, RecordModel, Service, SettingModel, sleep, STATUS, TaskModel, Time,
} from 'hydrooj';
import { BasicProvider, IBasicProvider, RemoteAccount } from './interface';
import providers from './providers/index';

const coll = db.collection('vjudge');
const logger = new Logger('vjudge');
const syncing = {};

class AccountService {
    api: IBasicProvider;
    problemLists: Set<string>;
    listUpdated = false;
    working = false;
    error = '';

    constructor(public Provider: BasicProvider, public account: RemoteAccount) {
        this.api = new Provider(account, async (data) => {
            await coll.updateOne({ _id: account._id }, { $set: data });
        });
        this.problemLists = Set.union(this.api.entryProblemLists || ['main'], this.account.problemLists || []);
        this.main().catch((e) => {
            logger.error(`Error occured in ${account.type}/${account.handle}`);
            this.working = false;
            this.error = e.message;
            console.error(e);
        });
    }

    async addProblemList(name: string) {
        if (this.problemLists.has(name)) return;
        this.problemLists.add(name);
        this.listUpdated = true;
        logger.info(`Discovered new problem list: ${name}`);
        await coll.updateOne({ _id: this.account._id }, { $push: { problemLists: name } });
    }

    async judge(task) {
        const rdoc = await RecordModel.get(task.domainId, task.rid);
        task = Object.assign(rdoc, task);
        const next = (payload) => JudgeHandler.next({ ...payload, rid: task.rid, domainId: task.domainId });
        const end = (payload) => JudgeHandler.end({ ...payload, rid: task.rid, domainId: task.domainId });
        await next({ status: STATUS.STATUS_FETCHED });
        try {
            const langConfig = SettingModel.langs[task.lang];
            if (langConfig.validAs?.[this.account.type]) task.lang = langConfig.validAs[this.account.type];
            const comment = langConfig.comment;
            if (comment) {
                const msg = `Hydro submission #${task.rid}@${new Date().getTime()}`;
                if (typeof comment === 'string') task.code = `${comment} ${msg}\n${task.code}`;
                else if (comment instanceof Array) task.code = `${comment[0]} ${msg} ${comment[1]}\n${task.code}`;
            }
            const rid = await this.api.submitProblem(task.target, task.lang, task.code, task, next, end);
            if (!rid) return;
            await next({ status: STATUS.STATUS_JUDGING, message: `ID = ${rid}` });
            const nextFunction = (data) => {
                if (data.case) delete data.case.message;
                if (data.cases) for (const x of data.cases) delete x.message;
                return next(data);
            };
            await this.api.waitForSubmission(rid, task.config?.detail === false ? nextFunction : next, end);
        } catch (e) {
            if (process.env.DEV) {
                logger.error(e);
                if (e.response) console.error(e.response);
            }
            end({ status: STATUS.STATUS_SYSTEM_ERROR, message: e.message });
        }
    }

    async sync(domainId: string, resync = false, list: string) {
        let page = 1;
        let pids = await this.api.listProblem(page, resync, list);
        while (pids.length) {
            logger.info(`${domainId}: Syncing page ${page}`);
            for (const id of pids) {
                if (id.startsWith('LIST::')) {
                    await this.addProblemList(id.split('::')[1]);
                    continue;
                }
                if (id.search('\\\\#') !== -1) continue;
                const [pid, metastr = '{}'] = id.split('#');
                const meta = JSON.parse(metastr);
                if (await ProblemModel.get(domainId, pid) || syncing[`${domainId}/${pid}`]) continue;
                syncing[`${domainId}/${pid}`] = true;
                try {
                    const res = await this.api.getProblem(pid, meta);
                    if (!res) continue;
                    const docId = await ProblemModel.add(domainId, pid, res.title, res.content, 1, res.tag);
                    if (res.difficulty) await ProblemModel.edit(domainId, docId, { difficulty: res.difficulty });
                    for (const key in res.files) {
                        await ProblemModel.addAdditionalFile(domainId, docId, key, res.files[key]);
                    }
                    for (const key in res.data) {
                        await ProblemModel.addTestdata(domainId, docId, key, res.data[key]);
                    }
                    logger.info(`${domainId}: problem ${docId}(${pid}) sync done`);
                } finally {
                    delete syncing[`${domainId}/${pid}`];
                }
                await sleep(5000);
            }
            page++;
            pids = await this.api.listProblem(page, resync, list);
        }
    }

    async login() {
        const login = await this.api.ensureLogin();
        if (login === true) {
            logger.info(`${this.account.type}/${this.account.handle}: logged in`);
            return true;
        }
        logger.warn(`${this.account.type}/${this.account.handle}: login fail`, login || '');
        return false;
    }

    async main() {
        const res = await this.login();
        if (!res) return;
        setInterval(() => this.login(), Time.hour);
        TaskModel.consume({ type: 'remotejudge', subType: this.account.type.split('.')[0] }, this.judge.bind(this), false);
        const ddocs = await DomainModel.getMulti({ mount: this.account.type.split('.')[0] }).toArray();
        this.working = true;
        do {
            this.listUpdated = false;
            for (const listName of this.problemLists) {
                for (const ddoc of ddocs) {
                    if (ddoc.syncDone === true) {
                        await DomainModel.edit(ddoc._id, { syncDone: { main: true } });
                        ddoc.syncDone = { main: true };
                    }
                    if (!ddoc.syncDone?.[listName]) await this.sync(ddoc._id, false, listName);
                    else await this.sync(ddoc._id, true, listName);
                    await DomainModel.edit(ddoc._id, { [`syncDone.${listName}`]: true });
                    ddoc.syncDone ||= {};
                    ddoc.syncDone[listName] = true;
                }
            }
        } while (this.listUpdated);
    }
}

declare module 'hydrooj' {
    interface Context {
        vjudge: VJudgeService;
    }
}

class VJudgeService extends Service {
    constructor(ctx) {
        super(ctx, 'vjudge', false);
    }

    accounts: RemoteAccount[];
    private providers: Record<string, any> = {};
    private pool: Record<string, any> = {};
    async start() {
        this.accounts = await coll.find().toArray();
    }

    addProvider(type: string, provider: BasicProvider, override = false) {
        if (process.env.VJUDGE_DEBUG && process.env.VJUDGE_DEBUG !== type) return;
        if (!override && this.providers[type]) throw new Error(`duplicate provider ${type}`);
        this.providers[type] = provider;
        for (const account of this.accounts.filter((a) => a.type === type)) {
            if (account.enableOn && !account.enableOn.includes(os.hostname())) continue;
            this.pool[`${account.type}/${account.handle}`] = new AccountService(provider, account);
        }
        this.caller?.on('dispose', () => {
            // TODO dispose session
        });
    }

    async checkStatus(onCheckFunc = false) {
        const res: Record<string, { working: boolean, error?: string, status?: any }> = {};
        for (const [k, v] of Object.entries(this.pool)) {
            res[k] = {
                working: v.working,
                error: v.error,
                status: v.api.checkStatus ? await v.api.checkStatus(onCheckFunc) : null,
            };
        }
        return res;
    }
}

export { BasicFetcher } from './fetch';
export { VERDICT } from './verdict';
export * from './interface';

Context.service('vjudge', VJudgeService);
export const name = 'vjudge';
export async function apply(ctx: Context) {
    if (process.env.NODE_APP_INSTANCE !== '0') return;
    if (process.env.HYDRO_CLI) return;
    const vjudge = new VJudgeService(ctx);
    await vjudge.start();
    // ctx.on('app/started', () => {
    for (const [k, v] of Object.entries(providers)) {
        vjudge.addProvider(k, v);
    }
    // });
    ctx.vjudge = vjudge;
    ctx.check.addChecker('Vjudge', async (_ctx, log, warn, error) => {
        const working = [];
        const pool = await vjudge.checkStatus(true);
        for (const [k, v] of Object.entries(pool)) {
            if (!v.working) error(`vjudge worker ${k}: ${v.error}`);
            else working.push(k);
            if (v.status) log(`vjudge worker ${k}: ${v.status}`);
        }
        if (!working.length) warn('no vjudge worker is working');
        log(`vjudge working workers: ${working.join(', ')}`);
    });
}
