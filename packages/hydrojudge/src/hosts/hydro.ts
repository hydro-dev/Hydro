import path from 'path';
import PQueue from 'p-queue';
import superagent from 'superagent';
import WebSocket from 'ws';
import type { LangConfig } from '@hydrooj/common';
import { fs, pipeRequest } from '@hydrooj/utils';
import * as sysinfo from '@hydrooj/utils/lib/sysinfo';
import type { JudgeResultBody } from 'hydrooj';
import { getConfig } from '../config';
import { FormatError, SystemError } from '../error';
import { compilerVersions, stackSize as getStackSize } from '../info';
import { Session } from '../interface';
import log from '../log';
import { JudgeTask } from '../task';

function removeNixPath(text: string) {
    return text.replace(/\/nix\/store\/[a-z0-9]{32}-/g, '/nix/');
}

export default class Hydro implements Session {
    ws: WebSocket;
    language: Record<string, LangConfig>;

    constructor(public config) {
        this.config.detail ??= true;
        this.config.cookie ||= '';
        this.config.last_update_at ||= 0;
        if (!this.config.server_url.startsWith('http')) this.config.server_url = `http://${this.config.server_url}`;
        if (!this.config.server_url.endsWith('/')) this.config.server_url = `${this.config.server_url}/`;
        this.getLang = this.getLang.bind(this);
    }

    get(url: string) {
        url = new URL(url, this.config.server_url).toString();
        return superagent.get(url).set('Cookie', this.config.cookie);
    }

    post(url: string, data?: any) {
        url = new URL(url, this.config.server_url).toString();
        const t = superagent.post(url)
            .set('Cookie', this.config.cookie)
            .set('Accept', 'application/json');
        return data ? t.send(data) : t;
    }

    async init() {
        await this.setCookie(this.config.cookie || '');
        await this.ensureLogin();
        setInterval(() => { this.get(''); }, 30000000); // Cookie refresh only
    }

    async fetchFile<T extends string | null>(namespace: T, files: Record<string, string>): Promise<T extends null ? string : null> {
        if (!namespace) { // record-related resource (code)
            const name = Object.keys(files)[0].split('#')[0];
            const res = await this.post('judge/files', { id: name });
            const target = Object.values(files)[0] || path.join(getConfig('tmp_dir'), Math.random().toString(36).substring(2));
            await pipeRequest(this.get(res.body.url), fs.createWriteStream(target), 60000, name);
            return target as any;
        }
        const [domainId, pid] = namespace.split('/');
        await this.ensureLogin();
        const res = await this.post(`/d/${domainId}/judge/files`, {
            pid: +pid,
            files: Object.keys(files),
        });
        if (!res.body.links) throw new FormatError('problem not exist');
        const queue = new PQueue({ concurrency: 10 });
        let error = null;
        queue.on('error', (e) => {
            error = e;
        });
        for (const name in res.body.links) {
            queue.add(async () => {
                if (name.includes('/')) await fs.ensureDir(path.dirname(files[name]));
                const w = fs.createWriteStream(files[name]);
                await pipeRequest(this.get(res.body.links[name]), w, 60000, name);
            });
        }
        await queue.onIdle();
        if (error) throw error;
        return null;
    }

    async postFile(target: string, filename: string, file: string, retry = 3) {
        try {
            await this.post('judge/upload')
                .field('rid', target)
                .field('name', filename)
                .attach('file', await fs.readFile(file));
        } catch (e) {
            if (!retry) {
                log.error('PostFile Fail: %s %s %o', target, filename, e);
                throw e;
            }
            await new Promise((resolve) => { setTimeout(resolve, 1000); });
            await this.postFile(target, filename, file, retry - 1);
        }
    }

    getLang(name: string, doThrow = true) {
        if (this.language[name]) return this.language[name];
        if (name === 'cpp' && this.language.cc) return this.language.cc;
        if (doThrow) throw new SystemError('Unsupported language {0}', [name]);
        return null;
    }

    send(rid: string, key: 'next' | 'end', data: Partial<JudgeResultBody>) {
        if (data.case && typeof data.case.message === 'string') data.case.message = removeNixPath(data.case.message);
        if (typeof data.message === 'string') data.message = removeNixPath(data.message);
        if (typeof data.compilerText === 'string') data.compilerText = removeNixPath(data.compilerText);
        this.ws.send(JSON.stringify({ ...data, rid, key }));
    }

    getReporter(t: JudgeTask) {
        const next = (data: Partial<JudgeResultBody>) => {
            log.debug('Next: %o', data);
            const performanceMode = getConfig('performance') || t.meta.rejudge || t.meta.hackRejudge;
            if (performanceMode && data.case && !data.compilerText && !data.message) {
                t.callbackCache ||= [];
                t.callbackCache.push(data.case);
                // TODO use rate-limited send
                // FIXME handle fields like score, time, memory, etc
            } else {
                this.send(t.request.rid, 'next', data);
            }
        };
        const end = (data: Partial<JudgeResultBody>) => {
            log.info('End: %o', data);
            if (t.callbackCache) data.cases = t.callbackCache;
            this.send(t.request.rid, 'end', data);
        };
        return { next, end };
    }

    async consume(queue: PQueue) {
        log.info('正在连接 %sjudge/conn', this.config.server_url);
        this.ws = new WebSocket(`${this.config.server_url.replace(/^http/i, 'ws')}judge/conn`, {
            headers: {
                Authorization: `Bearer ${this.config.cookie.split('sid=')[1].split(';')[0]}`,
            },
        });
        const config: { prio?: number, concurrency?: number, lang?: string[] } = {};
        if (this.config.minPriority !== undefined) config.prio = this.config.minPriority;
        if (this.config.concurrency !== undefined) config.concurrency = this.config.concurrency;
        if (this.config.lang?.length) config.lang = this.config.lang;
        const content = Object.keys(config).length
            ? JSON.stringify({ key: 'config', ...config })
            : '{"key":"ping"}';
        let compilers = {};
        let sendStatus = () => { };
        let stackSize = 0;
        this.ws.on('message', (data) => {
            if (data.toString() === 'ping') {
                this.ws.send('pong');
                return;
            }
            const request = JSON.parse(data.toString());
            if (request.language) {
                this.language = request.language;
                Promise.allSettled([
                    compilerVersions(this.language),
                    getStackSize(),
                ]).then(([compiler, stack]) => {
                    compilers = compiler.status === 'fulfilled' ? compiler.value : {};
                    stackSize = stack.status === 'fulfilled' ? stack.value : 0;
                    sendStatus();
                });
            }
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
                this.ws.send(content);
                this.ws.send('{"key":"start"}');
                if (!this.config.noStatus) {
                    const info = await sysinfo.get();
                    this.ws.send(JSON.stringify({ key: 'status', info: { ...info, stackSize } }));
                    sendStatus = () => this.ws.send(JSON.stringify({ key: 'status', info: { ...info, compilers, stackSize } }));
                    const interval = setInterval(async () => {
                        const [mid, inf] = await sysinfo.update();
                        this.ws.send(JSON.stringify({
                            key: 'status',
                            info: {
                                mid, ...inf, compilers, stackSize,
                            },
                        }));
                    }, 1200000);
                    let stopped = false;
                    const stop = () => {
                        if (!stopped) clearInterval(interval);
                        stopped = true;
                    };
                    this.ws.on('close', stop);
                    this.ws.on('error', stop);
                }
                resolve(null);
            });
        });
        log.info(`[${this.config.host}] 已连接`);
    }

    dispose() {
        this.ws?.close?.();
    }

    async setCookie(cookie: string) {
        this.config.cookie = cookie;
    }

    async login() {
        log.info('[%s] Updating session', this.config.host);
        const res = await this.post('login', {
            uname: this.config.uname, password: this.config.password, rememberme: 'on',
        });
        const setCookie = res.headers['set-cookie'];
        await this.setCookie(Array.isArray(setCookie) ? setCookie.join(';') : setCookie);
    }

    async ensureLogin() {
        try {
            const res = await this.get('judge/files').set('Accept', 'application/json');
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
