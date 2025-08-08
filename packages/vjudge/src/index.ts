/* eslint-disable no-await-in-loop */
import os from 'os';
import { LangConfig, STATUS } from '@hydrooj/common';
import {
    Context, db, DomainModel, JudgeResultCallbackContext, Logger,
    ProblemModel, RecordModel, Service, SettingModel,
    sleep, SolutionModel, SystemModel, TaskModel, Time, yaml,
} from 'hydrooj';
import { BasicProvider, IBasicProvider, RemoteAccount } from './interface';
import providers from './providers/index';

const coll = db.collection('vjudge');
const collMount = db.collection('vjudge.mount');
const logger = new Logger('vjudge');
const syncing = {};

class AccountService {
    api: IBasicProvider;
    problemLists: Set<string>;
    syncing = false;
    listUpdated = false;
    stopped = false;
    working = false;
    error = '';

    constructor(public Provider: BasicProvider, public account: RemoteAccount, public ctx: Context) {
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
        const context = new JudgeResultCallbackContext(this.ctx, task);
        const next = (payload) => context.next(payload);
        const end = (payload) => context.end(payload);
        await next({ status: STATUS.STATUS_FETCHED });
        try {
            const langConfig = SettingModel.langs[task.lang];
            if (this.Provider.Langs && !langConfig?.validAs?.[this.account.type]) {
                end({ status: STATUS.STATUS_COMPILE_ERROR, message: `Language not supported: ${task.lang}` });
                return;
            }
            if (langConfig.validAs?.[this.account.type]) task.lang = langConfig.validAs[this.account.type];
            const comment = langConfig.comment;
            if (comment && !this.Provider.noComment) {
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

    async sync(target: string, resync = false, list: string) {
        let page = 1;
        let pids = await this.api.listProblem(page, resync, list);
        const [domainId, namespaceId] = target.split('.');
        while (pids.length) {
            logger.info(`${domainId}: Syncing page ${page}`);
            for (const id of pids) {
                if (id.startsWith('LIST::')) {
                    await this.addProblemList(id.split('::')[1]);
                    continue;
                }
                if (id.search('\\\\#') !== -1) continue;
                const [pid, metastr = '{}'] = id.split('#');
                const normalizedPid = pid.replace(/[_-]/g, '');
                const meta = JSON.parse(metastr);
                const targetPid = namespaceId ? `${namespaceId}-${normalizedPid}` : normalizedPid;
                if (await ProblemModel.get(domainId, targetPid) || syncing[`${domainId}/${pid}`]) continue;
                syncing[`${domainId}/${pid}`] = true;
                try {
                    const res = await this.api.getProblem(pid, meta);
                    if (!res) continue;
                    const docId = await ProblemModel.add(domainId, targetPid, res.title, res.content, 1, res.tag);
                    if (res.difficulty) await ProblemModel.edit(domainId, docId, { difficulty: res.difficulty });
                    for (const key in res.files) {
                        await ProblemModel.addAdditionalFile(domainId, docId, key, res.files[key]);
                    }
                    for (const key in res.data) {
                        await ProblemModel.addTestdata(domainId, docId, key, res.data[key]);
                    }
                    if (res.solution) await SolutionModel.add(domainId, docId, 1, res.solution);
                    logger.info(`${domainId}: problem ${docId}(${pid}) sync done -> ${targetPid}(${docId})`);
                } finally {
                    delete syncing[`${domainId}/${pid}`];
                }
                await sleep(5000);
            }
            page++;
            if (this.stopped) return;
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

    async handleSync() {
        if (this.syncing) return;
        this.syncing = true;
        try {
            const mounts = await collMount.find({ mount: this.account.type.split('.')[0] }).toArray();
            do {
                this.listUpdated = false;
                for (const listName of this.problemLists) {
                    for (const mount of mounts) {
                        if (!mount.syncDone?.[listName]) await this.sync(mount._id, false, listName);
                        else await this.sync(mount._id, true, listName);
                        await collMount.updateOne({ _id: mount._id }, { $set: { [`syncDone.${listName}`]: true } });
                        mount.syncDone ||= {};
                        mount.syncDone[listName] = true;
                    }
                }
            } while (this.listUpdated);
        } catch (e) {
            this.error = e;
            logger.error('%s sync failed', this.account.handle);
            logger.error(e);
        }
        this.syncing = false;
    }

    async stop() {
        return this.api?.stop?.();
    }

    async main() {
        const res = await this.login();
        if (!res) return;
        const interval = setInterval(() => this.login(), Time.hour);
        const consumer = TaskModel.consume({ type: 'remotejudge', subType: this.account.type.split('.')[0] }, this.judge.bind(this), false);
        this.working = true;
        this.handleSync();
        this.stop = async () => {
            clearInterval(interval);
            consumer.destroy();
            this.stopped = true;
        };
    }
}

declare module 'hydrooj' {
    interface Context {
        vjudge: VJudgeService;
    }
}

class VJudgeService extends Service {
    constructor(ctx: Context) {
        super(ctx, 'vjudge');
    }

    accounts: RemoteAccount[] = [];
    private providers: Record<string, any> = {};
    private pool: Record<string, AccountService> = {};
    async [Context.init]() {
        if (process.env.NODE_APP_INSTANCE !== '0') return;
        if (process.env.HYDRO_CLI) return;
        this.accounts = await coll.find().toArray();
        this.ctx.interval(this.sync.bind(this), Time.week);
    }

    addProvider(type: string, provider: BasicProvider, override = false) {
        if (process.env.VJUDGE_DEBUG && !(`,${process.env.VJUDGE_DEBUG},`).includes(`,${type},`)) return;
        if (!override && this.providers[type]) throw new Error(`duplicate provider ${type}`);
        this.ctx.effect(() => {
            this.providers[type] = provider;
            const services = [];
            for (const account of this.accounts.filter((a) => a.type === type)) {
                if (account.enableOn && !account.enableOn.includes(os.hostname())) continue;
                const service = new AccountService(provider, account, this.ctx);
                services.push(service);
                this.pool[`${account.type}/${account.handle}`] = service;
            }
            return () => {
                for (const service of services) service.stop();
                delete this.providers[type];
            };
        });
        // FIXME: potential race condition
        if (provider.Langs) this.updateLangs(type, provider.Langs);
        // TODO dispose session
    }

    async updateLangs(provider: string, mapping: Record<string, Partial<LangConfig>>) {
        const config = yaml.load(SystemModel.get('hydrooj.langs')) as Record<string, Partial<LangConfig>>;
        const old = yaml.dump(config);
        const existingMappings: Set<string> = new Set();
        for (const key in config) {
            const target = config[key]?.validAs?.[provider];
            if (target) existingMappings.add(target);
        }
        for (const key in mapping) {
            if (existingMappings.has(mapping[key].key)) continue;
            config[key] ||= {
                execute: '/bin/echo For remote judge only',
                hidden: true,
                ...mapping[key],
            };
            config[key].validAs ||= {};
            config[key].validAs[provider] = mapping[key].key;
        }
        const newConfig = yaml.dump(config);
        if (old !== newConfig) await SystemModel.set('hydrooj.langs', newConfig);
    }

    async sync() {
        for (const key in this.pool) {
            const account = this.pool[key];
            if (!account.working) continue;
            await account.handleSync();
        }
    }

    async checkStatus(onCheckFunc = false) {
        const res: Record<string, { working: boolean, error?: string, status?: any }> = {};
        for (const [k, v] of Object.entries(this.pool)) {
            res[k] = {
                working: v.working,
                error: v.error,
                status: 'checkStatus' in v.api ? await v.api.checkStatus(onCheckFunc) : null,
            };
        }
        return res;
    }
}

export { BasicFetcher } from './fetch';
export * from './interface';
export { VERDICT } from './verdict';

export const name = 'vjudge';
export async function apply(ctx: Context) {
    ctx.plugin(VJudgeService);
    if (process.env.NODE_APP_INSTANCE !== '0') return;
    if (process.env.HYDRO_CLI) return;
    ctx.inject(['migration'], async (c) => {
        c.migration.registerChannel('vjudge', [
            async function init() { }, // eslint-disable-line
            c.migration.dontWait(async () => {
                const rewrite = (from: string[], to: string) => RecordModel.coll.updateMany({ lang: { $in: from } }, { $set: { lang: to } });
                await Promise.all([
                    rewrite(['csgoj.0', 'poj.1', 'poj.5'], 'c'),
                    rewrite(['csgoj.1'], 'cc.cc17o2'),
                    rewrite(['csgoj.3', 'poj.2'], 'java'),
                    rewrite(['csgoj.6'], 'py.py3'),
                    rewrite(['csgoj.17'], 'go'),
                    rewrite(['poj.0', 'poj.4'], 'cc.cc98'),
                ]);
            }, 'update csgoj and poj langs in record collection'),
            async () => {
                const ddocs = await DomainModel.coll.find({ mount: { $exists: true, $ne: null } }).toArray();
                for (const ddoc of ddocs) {
                    const syncDone = typeof ddoc.syncDone === 'object' ? ddoc.syncDone : { main: !!ddoc.syncDone };
                    await collMount.updateOne({ _id: ddoc._id }, { $set: { mount: ddoc.mount, syncDone } }, { upsert: true });
                }
                await DomainModel.coll.updateMany({}, { $unset: { mount: '', mountInfo: '', syncDone: '' } });
                return true;
            },
        ]);
    });
    ctx.inject(['vjudge'], async (c) => {
        for (const [k, v] of Object.entries(providers)) {
            if (!SystemModel.get(`vjudge.builtin-${k}-disable`)) c.vjudge.addProvider(k, v);
        }
        c.inject(['check'], ({ check }) => {
            check.addChecker('Vjudge', async (_ctx, log, warn, error) => {
                const working = [];
                const pool = await c.vjudge.checkStatus(true);
                for (const [k, v] of Object.entries(pool)) {
                    if (!v.working) error(`vjudge worker ${k}: ${v.error}`);
                    else working.push(k);
                    if (v.status) log(`vjudge worker ${k}: ${v.status}`);
                }
                if (!working.length) warn('no vjudge worker is working');
                log(`vjudge working workers: ${working.join(', ')}`);
            });
        });
    });
}
