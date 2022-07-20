/* eslint-disable no-await-in-loop */
import path from 'path';
import axios from 'axios';
import cac from 'cac';
import fs from 'fs-extra';
import { noop } from 'lodash';
import { ObjectID } from 'mongodb';
import PQueue from 'p-queue';
import WebSocket from 'ws';
import { LangConfig } from '@hydrooj/utils/lib/lang';
import { STATUS } from '@hydrooj/utils/lib/status';
import type { JudgeResultBody } from 'hydrooj';
import readCases, { processTestdata } from '../cases';
import { getConfig } from '../config';
import { CompileError, FormatError, SystemError } from '../error';
import judge from '../judge';
import log from '../log';
import type { CopyInFile } from '../sandbox/interface';
import * as sysinfo from '../sysinfo';
import * as tmpfs from '../tmpfs';
import {
    compilerText, Lock, md5, Queue,
} from '../utils';

const argv = cac().parse();

class JudgeTask {
    stat: Record<string, Date>;
    session: any;
    host: string;
    request: any;
    ws: WebSocket;
    source: string;
    rid: string;
    lang: string;
    code: CopyInFile;
    tmpdir: string;
    input?: string;
    clean: (() => Promise<any>)[];
    data: any[];
    folder: string;
    config: any;
    env: Record<string, string>;
    getLang: (name: string) => LangConfig;

    constructor(session: Hydro, request, ws: WebSocket) {
        this.stat = {};
        this.stat.receive = new Date();
        this.session = session;
        this.host = session.config.host;
        this.request = request;
        this.ws = ws;
        this.getLang = session.getLang;
    }

    async handle(startPromise = Promise.resolve()) {
        this.next = this.next.bind(this);
        this.end = this.end.bind(this);
        this.stat.handle = new Date();
        this.rid = this.request.rid;
        this.lang = this.request.lang;
        this.code = { content: this.request.code };
        this.config = this.request.config;
        this.input = this.request.input;
        this.data = this.request.data;
        this.source = this.request.source;
        this.tmpdir = path.resolve(getConfig('tmp_dir'), this.host, this.rid);
        this.clean = [];
        let tid = this.request.contest?.toString() || '';
        if (tid === '000000000000000000000000') tid = '';
        this.env = {
            HYDRO_DOMAIN: this.request.domainId.toString(),
            HYDRO_RECORD: this.rid,
            HYDRO_LANG: this.lang,
            HYDRO_USER: this.request.uid.toString(),
            HYDRO_CONTEST: tid,
        };
        await Lock.acquire(`${this.host}/${this.source}/${this.rid}`);
        fs.ensureDirSync(this.tmpdir);
        tmpfs.mount(this.tmpdir, getConfig('tmpfs_size'));
        log.info('Submission: %s/%s/%s', this.host, this.source, this.rid);
        try {
            await this.doSubmission(startPromise);
        } catch (e) {
            if (e instanceof CompileError) {
                this.next({ compilerText: compilerText(e.stdout, e.stderr) });
                this.end({
                    status: STATUS.STATUS_COMPILE_ERROR, score: 0, time: 0, memory: 0,
                });
            } else if (e instanceof FormatError) {
                this.next({ message: 'Testdata configuration incorrect.' });
                this.next({ message: { message: e.message, params: e.params } });
                this.end({
                    status: STATUS.STATUS_FORMAT_ERROR, score: 0, time: 0, memory: 0,
                });
            } else {
                log.error(e);
                this.next({ message: { message: e.message, params: e.params || [], ...argv.options.debug ? { stack: e.stack } : {} } });
                this.end({
                    status: STATUS.STATUS_SYSTEM_ERROR, score: 0, time: 0, memory: 0,
                });
            }
        } finally {
            Lock.release(`${this.host}/${this.source}/${this.rid}`);
            for (const clean of this.clean) await clean()?.catch(noop);
            tmpfs.umount(this.tmpdir);
            fs.removeSync(this.tmpdir);
        }
    }

    async doSubmission(startPromise = Promise.resolve()) {
        this.stat.cache_start = new Date();
        this.folder = await this.session.cacheOpen(this.source, this.data, this.next);
        if ((this.code as any).content.startsWith('@@hydro_submission_file@@')) {
            const id = (this.code as any).content.split('@@hydro_submission_file@@')[1]?.split('#')?.[0];
            const target = await this.session.fetchCodeFile(id);
            this.code = { src: target };
            this.clean.push(() => fs.remove(target));
        }
        this.stat.read_cases = new Date();
        this.config = await readCases(
            this.folder,
            {
                detail: this.session.config.detail,
                isSelfSubmission: this.config.problemOwner === this.request.uid,
                ...this.config,
            },
            { next: this.next, key: md5(`${this.source}/${getConfig('secret')}`) },
        );
        this.stat.judge = new Date();
        const type = typeof this.input === 'string' ? 'run' : this.config.type || 'default';
        if (!judge[type]) throw new FormatError('Unrecognized problemType: {0}', [type]);
        await judge[type].judge(this, startPromise);
    }

    next(data: Partial<JudgeResultBody>) {
        log.debug('Next: %d %o', data);
        data.key = 'next';
        data.rid = new ObjectID(this.rid);
        if (data.case) data.case.message ||= '';
        this.ws.send(JSON.stringify(data));
    }

    end(data: Partial<JudgeResultBody>) {
        log.info('End: %o', data);
        data.key = 'end';
        data.rid = this.request.rid;
        this.ws.send(JSON.stringify(data));
    }
}

export default class Hydro {
    config: any;
    axios: any;
    ws: WebSocket;
    language: Record<string, LangConfig>;

    constructor(config) {
        this.config = config;
        this.config.detail = this.config.detail ?? true;
        this.config.cookie = this.config.cookie || '';
        this.config.last_update_at = this.config.last_update_at || 0;
        if (!this.config.server_url.startsWith('http')) this.config.server_url = `http://${this.config.server_url}`;
        if (!this.config.server_url.endsWith('/')) this.config.server_url = `${this.config.server_url}/`;
        this.getLang = this.getLang.bind(this);
    }

    async init() {
        await this.setCookie(this.config.cookie || '');
        await this.ensureLogin();
        setInterval(() => { this.axios.get(''); }, 30000000); // Cookie refresh only
    }

    async cacheOpen(source: string, files: any[], next?) {
        await Lock.acquire(`${this.config.host}/${source}`);
        try {
            return this._cacheOpen(source, files, next);
        } finally {
            Lock.release(`${this.config.host}/${source}`);
        }
    }

    async _cacheOpen(source: string, files: any[], next?) {
        const [domainId, pid] = source.split('/');
        const filePath = path.join(getConfig('cache_dir'), this.config.host, source);
        await fs.ensureDir(filePath);
        if (!files?.length) throw new FormatError('Problem data not found.');
        let etags: Record<string, string> = {};
        try {
            etags = JSON.parse(fs.readFileSync(path.join(filePath, 'etags')).toString());
        } catch (e) { /* ignore */ }
        const version = {};
        const filenames = [];
        const allFiles = new Set<string>();
        for (const file of files) {
            allFiles.add(file.name);
            version[file.name] = file.etag + file.lastModified;
            if (etags[file.name] !== file.etag + file.lastModified) filenames.push(file.name);
        }
        for (const name in etags) {
            if (!allFiles.has(name) && fs.existsSync(path.join(filePath, name))) await fs.remove(path.join(filePath, name));
        }
        if (filenames.length) {
            log.info(`Getting problem data: ${this.config.host}/${source}`);
            if (next) next({ message: 'Syncing testdata, please wait...' });
            await this.ensureLogin();
            const res = await this.axios.post(`/d/${domainId}/judge/files`, {
                pid: +pid,
                files: filenames,
            });
            // eslint-disable-next-line no-inner-declarations
            async function download(name: string) {
                if (name.includes('/')) await fs.ensureDir(path.join(filePath, name.split('/')[0]));
                const f = await this.axios.get(res.data.links[name], { responseType: 'stream' })
                    .catch((e) => new Error(`DownloadFail(${name}): ${e.message}`));
                if (f instanceof Error) throw f;
                const w = fs.createWriteStream(path.join(filePath, name));
                f.data.pipe(w);
                await new Promise((resolve, reject) => {
                    w.on('finish', resolve);
                    w.on('error', (e) => reject(new Error(`DownloadFail(${name}): ${e.message}`)));
                });
            }
            const tasks = [];
            const queue = new PQueue({ concurrency: 10 });
            for (const name in res.data.links) {
                tasks.push(queue.add(() => download.call(this, name)));
            }
            queue.start();
            await Promise.all(tasks);
            fs.writeFileSync(path.join(filePath, 'etags'), JSON.stringify(version));
            await processTestdata(filePath);
        }
        fs.writeFileSync(path.join(filePath, 'lastUsage'), new Date().getTime().toString());
        return filePath;
    }

    async fetchCodeFile(name: string) {
        const res = await this.axios.post('judge/code', { id: name });
        const f = await this.axios.get(res.data.url, { responseType: 'stream' })
            .catch((e) => new Error(`DownloadFail(${name}): ${e.message}`));
        if (f instanceof Error) throw f;
        const target = path.join('/tmp/hydro/judge', name.replace(/\//g, '_'));
        const w = fs.createWriteStream(target);
        f.data.pipe(w);
        await new Promise((resolve, reject) => {
            w.on('finish', resolve);
            w.on('error', (e) => reject(new Error(`DownloadFail(${name}): ${e.message}`)));
        });
        return target;
    }

    getLang(name: string, doThrow = true) {
        if (this.language[name]) return this.language[name];
        if (name === 'cpp' && this.language.cc) return this.language.cc;
        if (doThrow) throw new SystemError('Unsupported language {0}', [name]);
        return null;
    }

    async consume(queue: Queue<any>) {
        log.info('正在连接 %sjudge/conn', this.config.server_url);
        this.ws = new WebSocket(`${this.config.server_url.replace(/^http/i, 'ws')}judge/conn`, {
            headers: {
                Authorization: `Bearer ${this.config.cookie.split('sid=')[1].split(';')[0]}`,
            },
        });
        global.onDestroy.push(() => this.ws.close());
        const content = this.config.minPriority !== undefined
            ? `{"key":"prio","prio":${this.config.minPriority}}`
            : '{"key":"ping"}';
        setInterval(() => this.ws?.send?.(content), 30000);
        this.ws.on('message', (data) => {
            const request = JSON.parse(data.toString());
            if (request.language) this.language = request.language;
            if (request.task) queue.push(new JudgeTask(this, request.task, this.ws));
        });
        this.ws.on('close', (data, reason) => {
            log.warn(`[${this.config.host}] Websocket 断开:`, data, reason.toString());
            setTimeout(() => this.retry(queue), 30000);
        });
        this.ws.on('error', (e) => {
            log.error(`[${this.config.host}] Websocket 错误:`, e);
            setTimeout(() => this.retry(queue), 30000);
        });
        await new Promise((resolve) => {
            this.ws.once('open', async () => {
                if (!this.config.noStatus) {
                    const info = await sysinfo.get();
                    this.ws.send(JSON.stringify({ key: 'status', info }));
                    setInterval(async () => {
                        const [mid, inf] = await sysinfo.update();
                        this.ws.send(JSON.stringify({ key: 'status', info: { mid, ...inf } }));
                    }, 1200000);
                }
                resolve(null);
            });
        });
        log.info(`[${this.config.host}] 已连接`);
    }

    async setCookie(cookie: string) {
        this.config.cookie = cookie;
        this.axios = axios.create({
            baseURL: this.config.server_url,
            timeout: 30000,
            headers: {
                accept: 'application/json',
                'Content-Type': 'application/json',
                cookie: this.config.cookie,
            },
        });
    }

    async login() {
        log.info('[%s] Updating session', this.config.host);
        const res = await this.axios.post('login', {
            uname: this.config.uname, password: this.config.password, rememberme: 'on',
        });
        await this.setCookie(res.headers['set-cookie'].join(';'));
    }

    async ensureLogin() {
        try {
            const res = await this.axios.get('judge/files');
            // Redirected to /login
            if (res.data.url) await this.login();
        } catch (e) {
            await this.login();
        }
    }

    async retry(queue: Queue<any>) {
        this.consume(queue).catch(() => {
            setTimeout(() => this.retry(queue), 30000);
        });
    }
}
