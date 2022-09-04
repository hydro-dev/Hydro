/* eslint-disable no-await-in-loop */
import path from 'path';
import { ObjectID } from 'bson';
import fs from 'fs-extra';
import PQueue from 'p-queue';
import superagent from 'superagent';
import WebSocket from 'ws';
import { LangConfig } from '@hydrooj/utils/lib/lang';
import * as sysinfo from '@hydrooj/utils/lib/sysinfo';
import type { JudgeResultBody } from 'hydrooj';
import { processTestdata } from '../cases';
import { getConfig } from '../config';
import { FormatError, SystemError } from '../error';
import log from '../log';
import { JudgeTask } from '../task';
import { Lock } from '../utils';

function removeNixPath(text: string) {
    return text.replace(/\/nix\/store\/[a-z0-9]{32}-/g, '/nix/');
}

export default class Hydro {
    ws: WebSocket;
    language: Record<string, LangConfig>;

    constructor(public config) {
        this.config.detail = this.config.detail ?? true;
        this.config.cookie = this.config.cookie || '';
        this.config.last_update_at = this.config.last_update_at || 0;
        if (!this.config.server_url.startsWith('http')) this.config.server_url = `http://${this.config.server_url}`;
        if (!this.config.server_url.endsWith('/')) this.config.server_url = `${this.config.server_url}/`;
        this.getLang = this.getLang.bind(this);
    }

    get(url) {
        return superagent.get(this.config.server_url + url).set('Cookie', this.config.cookie);
    }

    post(url, data) {
        return superagent.post(this.config.server_url + url).send(data)
            .set('Cookie', this.config.cookie)
            .set('Accept', 'application/json');
    }

    async init() {
        await this.setCookie(this.config.cookie || '');
        await this.ensureLogin();
        setInterval(() => { this.get(''); }, 30000000); // Cookie refresh only
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
            const res = await this.post(`/d/${domainId}/judge/files`, {
                pid: +pid,
                files: filenames,
            });
            // eslint-disable-next-line no-inner-declarations
            async function download(name: string) {
                if (name.includes('/')) await fs.ensureDir(path.join(filePath, name.split('/')[0]));
                const w = fs.createWriteStream(path.join(filePath, name));
                this.get(res.body.links[name]).pipe(w);
                await new Promise((resolve, reject) => {
                    w.on('finish', resolve);
                    w.on('error', (e) => reject(new Error(`DownloadFail(${name}): ${e.message}`)));
                });
            }
            const tasks = [];
            const queue = new PQueue({ concurrency: 10 });
            for (const name in res.body.links) {
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

    async fetchFile(name: string) {
        name = name.split('#')[0];
        const res = await this.post('judge/code', { id: name });
        const target = path.join('/tmp/hydro/judge', name.replace(/\//g, '_'));
        const w = fs.createWriteStream(target);
        this.get(res.body.url).pipe(w);
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

    send(rid: string | ObjectID, key: 'next' | 'end', data: Partial<JudgeResultBody>) {
        data.rid = new ObjectID(rid);
        data.key = key;
        if (data.case) data.case.message ||= '';
        if (typeof data.message === 'string') data.message = removeNixPath(data.message);
        if (typeof data.compilerText === 'string') data.compilerText = removeNixPath(data.compilerText);
        this.ws.send(JSON.stringify(data));
    }

    getNext(t: JudgeTask) {
        return (data: Partial<JudgeResultBody>) => {
            log.debug('Next: %d %o', data);
            this.send(t.request.rid, 'next', data);
        };
    }

    getEnd(t: JudgeTask) {
        return (data: Partial<JudgeResultBody>) => {
            log.info('End: %o', data);
            this.send(t.request.rid, 'end', data);
        };
    }

    async consume(queue: PQueue) {
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
            if (request.task) queue.add(() => new JudgeTask(this, request.task).handle().catch((e) => log.error(e)));
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
    }

    async login() {
        log.info('[%s] Updating session', this.config.host);
        const res = await this.post('login', {
            uname: this.config.uname, password: this.config.password, rememberme: 'on',
        });
        await this.setCookie(res.headers['set-cookie'].join(';'));
    }

    async ensureLogin() {
        try {
            const res = await this.get('judge/files');
            // Redirected to /login
            if (res.body.url) await this.login();
        } catch (e) {
            await this.login();
        }
    }

    async retry(queue: PQueue) {
        this.consume(queue).catch(() => {
            setTimeout(() => this.retry(queue), 30000);
        });
    }
}
