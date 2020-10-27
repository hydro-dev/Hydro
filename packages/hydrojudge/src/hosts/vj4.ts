/* eslint-disable no-await-in-loop */
import path from 'path';
import child from 'child_process';
import axios from 'axios';
import fs from 'fs-extra';
import WebSocket from 'ws';
import * as tmpfs from '../tmpfs';
import log from '../log';
import { compilerText } from '../utils';
import { CACHE_DIR, TEMP_DIR } from '../config';
import { FormatError, CompileError, SystemError } from '../error';
import { STATUS_COMPILE_ERROR, STATUS_SYSTEM_ERROR } from '../status';
import readCases from '../cases';
import judge from '../judge';

class JudgeTask {
    stat: Record<string, Date>;

    session: any;

    host: string;

    request: any;

    ws: WebSocket;

    tag: any;

    type: any;

    domain_id: string;

    pid: string;

    rid: string;

    lang: string;

    code: string;

    tmpdir: string;

    clean: Function[];

    folder: string;

    config: any;

    nextId = 1;

    nextWaiting = [];

    constructor(session, request, ws: WebSocket) {
        this.stat = {};
        this.stat.receive = new Date();
        this.session = session;
        this.host = session.config.host;
        this.request = request;
        this.ws = ws;
    }

    async handle() {
        this.next = this.next.bind(this);
        this.end = this.end.bind(this);
        this.stat.handle = new Date();
        this.tag = this.request.tag;
        this.type = this.request.type;
        this.domain_id = this.request.domain_id;
        this.pid = this.request.pid;
        this.rid = this.request.rid;
        this.lang = this.request.lang;
        this.code = this.request.code;
        this.tmpdir = path.resolve(TEMP_DIR, 'tmp', this.host, this.rid);
        this.clean = [];
        fs.ensureDirSync(this.tmpdir);
        tmpfs.mount(this.tmpdir, '64m');
        log.info('Submission: %s/%s/%s pid=%s', this.host, this.domain_id, this.rid, this.pid);
        try {
            if (this.type === 0) await this.doSubmission();
            else if (this.type === 1) await this.doPretest();
            else throw new SystemError(`Unsupported type: ${this.type}`);
        } catch (e) {
            if (e instanceof CompileError) {
                this.next({ compiler_text: compilerText(e.stdout, e.stderr) });
                this.end({
                    status: STATUS_COMPILE_ERROR, score: 0, time_ms: 0, memory_kb: 0,
                });
            } else if (e instanceof FormatError) {
                this.next({ judge_text: '题目配置出现错误。请联系题目上传者。' });
                this.next({ judge_text: `${e.message}\n${JSON.stringify(e.params)}` });
                this.end({
                    status: STATUS_SYSTEM_ERROR, score: 0, time_ms: 0, memory_kb: 0,
                });
            } else {
                log.error(e);
                this.next({ judge_text: `${e.message}\n${e.stack}\n${JSON.stringify(e.params)}` });
                this.end({
                    status: STATUS_SYSTEM_ERROR, score: 0, time_ms: 0, memory_kb: 0,
                });
            }
        }
        for (const clean of this.clean) await clean().catch();
        tmpfs.umount(this.tmpdir);
        fs.removeSync(this.tmpdir);
    }

    async doSubmission() {
        this.stat.cache_start = new Date();
        this.folder = await this.session.cacheOpen(this.domain_id, this.pid, this.next);
        this.stat.read_cases = new Date();
        this.config = await readCases(
            this.folder,
            { detail: this.session.config.detail },
            { next: this.next },
        );
        this.stat.judge = new Date();
        await judge[this.config.type || 'default'].judge(this);
    }

    async doPretest() {
        this.folder = path.resolve(this.tmpdir, 'data');
        await this.session.recordPretestData(this.rid, this.folder);
        this.config = await readCases(
            this.folder,
            { detail: this.session.config.detail },
            { next: this.next },
        );
        await judge[this.config.type || 'default'].judge(this);
    }

    next(data, id?: number) {
        if (data.message !== undefined) {
            data.judge_text = data.message;
            delete data.message;
        }
        if (data.case?.message !== undefined) {
            data.case.judge_text = data.case.message;
            delete data.case.message;
        }
        data.key = 'next';
        data.tag = this.tag;
        if (id) {
            if (id === this.nextId) {
                this.ws.send(JSON.stringify(data));
                this.nextId++;
                let t = true;
                while (t) {
                    t = false;
                    for (const i in this.nextWaiting) {
                        if (this.nextId === this.nextWaiting[i].id) {
                            this.ws.send(JSON.stringify(this.nextWaiting[i].data));
                            this.nextId++;
                            this.nextWaiting.splice(+i, 1);
                            t = true;
                        }
                    }
                }
            } else this.nextWaiting.push({ data, id });
        } else this.ws.send(JSON.stringify(data));
    }

    end(data) {
        if (data.message !== undefined) {
            data.judge_text = data.message;
            delete data.message;
        }
        data.key = 'end';
        data.tag = this.tag;
        log.info('Status=%d Score=%s Time=%dms Memory=%dkb', data.status, data.score, data.time_ms, data.memory_kb);
        this.ws.send(JSON.stringify(data));
    }
}

export default class VJ4 {
    config: any;

    axios: any;

    ws: WebSocket;

    constructor(config) {
        this.config = config;
        this.config.detail = this.config.detail || true;
        this.config.cookie = this.config.cookie || '';
        this.config.last_update_at = this.config.last_update_at || 0;
        if (!this.config.server_url.startsWith('http')) this.config.server_url = `http://${this.config.server_url}`;
        if (!this.config.server_url.endsWith('/')) this.config.server_url = `${this.config.server_url}/`;
    }

    async init() {
        await this.setCookie(this.config.cookie || '');
        await this.ensureLogin();
        setInterval(() => { this.axios.get('judge/noop'); }, 30000000);
    }

    async problemDataVersion(domainId: string, pid: string, retry = 3) {
        let location: string;
        let err: Error;
        await this.ensureLogin();
        try {
            await this.axios.get(`d/${domainId}/p/${pid}/data`, { maxRedirects: 0 });
        } catch (res) {
            res.response = res.response || {};
            if (res.response.status === 302) {
                location = res.response.headers.location;
                if (location.includes('/fs/')) return location;
            } else if (res.response.status === 404) {
                throw new FormatError(`没有找到测试数据 ${domainId}/${pid}`);
            } else {
                if (retry) return await this.problemDataVersion(domainId, pid, retry - 1);
                res.config = res.request = null;
                err = res;
                log.error('%o', err);
            }
        }
        if (!location) return 'unknown';
        try {
            await this.axios.get(location, { maxRedirects: 0 });
        } catch (res) {
            res.response = res.response || {};
            if (res.response.status === 302) return res.response.headers.location;
            if (res.response.status === 404) throw new FormatError(`没有找到测试数据 ${domainId}/${pid}`);
            else {
                if (retry) return await this.problemDataVersion(domainId, pid, retry - 1);
                res.config = res.request = null;
                err = res;
                log.error(err);
            }
        }
        return 'unknown';
    }

    async problemData(domainId: string, pid: string, savePath, retry = 3, next?) {
        log.info(`Getting problem data: ${this.config.host}/${domainId}/${pid}`);
        await this.ensureLogin();
        if (next) next({ judge_text: '正在同步测试数据，请稍后' });
        const tmpFilePath = path.resolve(CACHE_DIR, `download_${this.config.host}_${domainId}_${pid}`);
        try {
            const res = await this.axios.get(
                `${this.config.server_url}d/${domainId}/p/${pid}/data`,
                { responseType: 'stream' },
            );
            const w = await fs.createWriteStream(tmpFilePath);
            res.data.pipe(w);
            await new Promise((resolve, reject) => {
                w.on('finish', resolve);
                w.on('error', reject);
            });
            fs.ensureDirSync(path.dirname(savePath));
            await new Promise((resolve, reject) => {
                child.exec(`unzip ${tmpFilePath} -d ${savePath}`, (e) => {
                    if (e) reject(e);
                    else resolve();
                });
            });
            await fs.unlink(tmpFilePath);
            await this.processData(savePath).catch();
        } catch (e) {
            if (retry) await this.problemData(domainId, pid, savePath, retry - 1);
            else throw e;
        }
        return savePath;
    }

    async recordPretestData(rid, savePath) {
        log.info(`Getting pretest data: ${this.config.host}/${rid}`);
        const tmpFilePath = path.resolve(CACHE_DIR, `download_${this.config.host}_${rid}`);
        await this.ensureLogin();
        const res = await this.axios.get(`records/${rid}/data`, { responseType: 'stream' });
        const w = await fs.createWriteStream(tmpFilePath);
        res.data.pipe(w);
        await new Promise((resolve, reject) => {
            w.on('finish', resolve);
            w.on('error', reject);
        });
        fs.ensureDirSync(path.dirname(savePath));
        await new Promise((resolve, reject) => {
            child.exec(`unzip ${tmpFilePath} -d ${savePath}`, (e) => {
                if (e) reject(e);
                else resolve();
            });
        });
        await fs.unlink(tmpFilePath);
        await this.processData(savePath);
        return savePath;
    }

    async consume(queue) {
        log.info('正在连接 %sjudge/consume-conn', this.config.server_url);
        const res = await this.axios.get('judge/consume-conn/info');
        this.ws = new WebSocket(`${this.config.server_url.replace(/^http/i, 'ws')}judge/consume-conn/websocket?t=${res.data.entropy}`, {
            headers: { cookie: this.config.cookie },
        });
        this.ws.on('message', (data) => {
            const request = JSON.parse(data.toString());
            if (!request.event) queue.push(new JudgeTask(this, request, this.ws));
        });
        this.ws.on('close', (data, reason) => {
            log.warn(`[${this.config.host}] Websocket 断开:`, data, reason);
            setTimeout(() => {
                this.retry(queue);
            }, 30000);
        });
        this.ws.on('error', (e) => {
            log.error(`[${this.config.host}] Websocket 错误:`, e);
            setTimeout(() => {
                this.retry(queue);
            }, 30000);
        });
        await new Promise((resolve) => {
            this.ws.once('open', () => { resolve(); });
        });
        log.info(`[${this.config.host}] 已连接`);
    }

    async setCookie(cookie) {
        this.config.cookie = cookie;
        this.axios = axios.create({
            baseURL: this.config.server_url,
            timeout: 30000,
            headers: {
                accept: 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded',
                cookie: this.config.cookie,
            },
            transformRequest: [
                (data) => {
                    let ret = '';
                    for (const it in data) {
                        ret += `${encodeURIComponent(it)}=${encodeURIComponent(data[it])}&`;
                    }
                    return ret;
                },
            ],
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
            await this.axios.get('judge/noop');
        } catch (e) {
            await this.login();
        }
    }

    async processData(folder) { // eslint-disable-line class-methods-use-this
        let files = await fs.readdir(folder);
        let ini = false;
        if (files.length <= 2) {
            if (files.length === 2) files.splice(files.indexOf('version'), 1);
            const s = fs.statSync(path.resolve(folder, files[0]));
            if (s.isDirectory()) folder = path.resolve(folder, files[0]);
        }
        files = await fs.readdir(folder);
        for (const i of files) {
            if (i.toLowerCase() === 'config.ini') {
                ini = true;
                await fs.rename(`${folder}/${i}`, `${folder}/config.ini`);
                break;
            }
        }
        if (ini) {
            for (const i of files) {
                if (i.toLowerCase() === 'input') await fs.rename(`${folder}/${i}`, `${folder}/input`);
                else if (i.toLowerCase() === 'output') await fs.rename(`${folder}/${i}`, `${folder}/output`);
            }
            files = await fs.readdir(`${folder}/input`);
            for (const i of files) await fs.rename(`${folder}/input/${i}`, `${folder}/input/${i.toLowerCase()}`);
            files = await fs.readdir(`${folder}/output`);
            for (const i of files) await fs.rename(`${folder}/output/${i}`, `${folder}/output/${i.toLowerCase()}`);
        }
    }

    async cacheOpen(domainId: string, pid: string, next) {
        const domainDir = path.join(CACHE_DIR, this.config.host, domainId);
        const filePath = path.join(domainDir, pid);
        const version = await this.problemDataVersion(domainId, pid);
        if (fs.existsSync(filePath)) {
            let ver;
            try {
                ver = fs.readFileSync(path.join(filePath, 'version')).toString();
            } catch (e) { /* ignore */ }
            if (version === ver) return filePath;
            fs.removeSync(filePath);
        }
        fs.ensureDirSync(domainDir);
        await this.problemData(domainId, pid, filePath, 3, next);
        fs.writeFileSync(path.join(filePath, 'version'), version);
        return filePath;
    }

    async retry(queue) {
        this.consume(queue).catch(() => {
            setTimeout(() => {
                this.retry(queue);
            }, 30000);
        });
    }
}
