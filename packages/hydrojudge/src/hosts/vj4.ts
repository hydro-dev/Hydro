/* eslint-disable no-await-in-loop */
import path from 'path';
import AdmZip from 'adm-zip';
import PQueue from 'p-queue';
import superagent from 'superagent';
import WebSocket from 'ws';
import { fs, noop } from '@hydrooj/utils';
import { parseLang } from '@hydrooj/utils/lib/lang';
import { STATUS } from '@hydrooj/utils/lib/status';
import type { JudgeResultBody } from 'hydrooj';
import { getConfig } from '../config';
import { FormatError, SystemError } from '../error';
import { Session } from '../interface';
import log from '../log';
import { JudgeTask } from '../task';
import { pipeRequest } from '../utils';

function removeNixPath(text: string) {
    return text.replace(/\/nix\/store\/[a-z0-9]{32}-/g, '/nix/');
}

const langs = parseLang(fs.readFileSync(path.resolve(__dirname, '../../langs.yaml'), 'utf-8'));

export default class VJ4 implements Session {
    config: any;
    progress = 0;
    ws: WebSocket;

    async fetchFile(): Promise<string> {
        throw new Error('not implemented');
    }

    async postFile() {
        throw new Error('not implemented');
    }

    getLang(name: string, doThrow = true) {
        if (langs[name]) return langs[name];
        if (name === 'cpp' && langs.cc) return langs.cc;
        if (doThrow) throw new SystemError('Unsupported language {0}', [name]);
        return null;
    }

    send(tag: string | number, key: 'next' | 'end', data: any) {
        if (data.case && typeof data.case.message === 'string') data.case.message = removeNixPath(data.case.message);
        if (data.message) {
            if (typeof data.message !== 'string') data.message = data.message.message.format(data.message.params);
            data.judge_text = removeNixPath(data.message);
            delete data.message;
        }
        if (typeof data.compilerText === 'string') {
            data.compiler_text = removeNixPath(data.compilerText);
            delete data.compilerText;
        }
        if (data.status === STATUS.STATUS_FORMAT_ERROR) {
            data.status = STATUS.STATUS_SYSTEM_ERROR;
        }
        if (data.case) {
            data.case.time_ms = data.case.time || 0;
            data.case.memory_kb = data.case.memory || 0;
            data.case.judge_text = data.case.message || '';
            delete data.case.time;
            delete data.case.memory;
            delete data.case.message;
            if (data.case?.judge_text && typeof data.case?.judge_text !== 'string') {
                data.case.judge_text = data.case.judge_text.message.format(data.case.judge_text.params);
            }
        }
        if (data.time) data.time_ms = data.time;
        if (data.memory) data.memory_kb = data.memory;
        if (key === 'end') {
            data.time_ms ||= 0;
            data.memory_kb ||= 0;
            data.score ||= 0;
        }
        if (data.progress) this.progress = data.progress;
        if (data.addProgress) {
            this.progress += data.addProgress;
            data.progress = this.progress;
        }
        this.ws.send(JSON.stringify({ ...data, tag, key }));
    }

    getNext(t: JudgeTask) {
        return (data: Partial<JudgeResultBody>) => {
            log.debug('Next: %o', data);
            this.send((t.request as any).tag, 'next', data);
        };
    }

    getEnd(t: JudgeTask) {
        return (data: Partial<JudgeResultBody>) => {
            log.info('End: %o', data);
            this.send((t.request as any).tag, 'end', data);
        };
    }

    get(url: string) {
        url = new URL(url, this.config.server_url).toString();
        const p = superagent.get(url);
        if (this.config.cookie) return p.set('Cookie', this.config.cookie);
        return p;
    }

    post(url: string, data?: any) {
        url = new URL(url, this.config.server_url).toString();
        let t = superagent.post(url).type('form');
        if (this.config.cookie) t = t.set('Cookie', this.config.cookie);
        return data ? t.send(data) : t;
    }

    constructor(config) {
        this.config = config;
        this.config.detail ??= true;
        this.config.cookie ||= '';
        this.config.last_update_at ||= 0;
        if (!this.config.server_url.startsWith('http')) this.config.server_url = `http://${this.config.server_url}`;
        if (!this.config.server_url.endsWith('/')) this.config.server_url = `${this.config.server_url}/`;
    }

    async init() {
        await this.setCookie(this.config.cookie || '');
        await this.ensureLogin();
        setInterval(() => { this.get('judge/noop'); }, 30000000);
    }

    async problemDataVersion(domainId: string, pid: string) {
        let location: string;
        await this.ensureLogin();
        const res = await this.get(`d/${domainId}/p/${pid}/data`).redirects(0).ok((r) => r.status === 302 || r.status === 404);
        if (res.status === 404) throw new FormatError(`没有找到测试数据 ${domainId}/${pid}`);
        if (res.status === 302) {
            location = res.headers.location;
            if (!location.includes('/fs/')) {
                const _res = await this.get(location).redirects(0).ok((r) => r.status === 302 || r.status === 404);
                if (_res.status === 404) throw new FormatError(`没有找到测试数据 ${domainId}/${pid}`);
                if (_res.status === 302) {
                    location = _res.headers.location;
                    if (!location.includes('/fs/')) throw new Error();
                }
                return _res.headers.location;
            }
        }
        return res.headers.location;
    }

    async problemData(domainId: string, pid: string, savePath: string, retry = 3, next?) {
        log.info(`Getting problem data: ${this.config.host}/${domainId}/${pid}`);
        await this.ensureLogin();
        if (next) next({ judge_text: '正在同步测试数据，请稍后' });
        const tmpFilePath = path.resolve(getConfig('cache_dir'), `download_${this.config.host}_${domainId}_${pid}`);
        try {
            await pipeRequest(
                this.get(`${this.config.server_url}d/${domainId}/p/${pid}/data`),
                fs.createWriteStream(tmpFilePath),
            );
            fs.ensureDirSync(path.dirname(savePath));
            const zip = new AdmZip(tmpFilePath);
            const entries = zip.getEntries();
            if (entries.length > 512) throw new FormatError('Too many files');
            if (Math.sum(entries.map((i) => i.header.size)) > 256 * 1024 * 1024) throw new FormatError('File too large');
            await new Promise((resolve, reject) => {
                zip.extractAllToAsync(savePath, true, (e) => {
                    if (e) reject(e);
                    else resolve(null);
                });
            });
            await fs.unlink(tmpFilePath);
            await this.processData(savePath).catch(noop);
        } catch (e) {
            if (retry) await this.problemData(domainId, pid, savePath, retry - 1);
            else throw e;
        }
        return savePath;
    }

    async recordPretestData(rid: string, savePath: string) {
        log.info(`Getting pretest data: ${this.config.host}/${rid}`);
        const tmpFilePath = path.resolve(getConfig('cache_dir'), `download_${this.config.host}_${rid}`);
        await this.ensureLogin();
        const w = fs.createWriteStream(tmpFilePath);
        await pipeRequest(this.get(`records/${rid}/data`), w);
        fs.ensureDirSync(path.dirname(savePath));
        const zip = new AdmZip(tmpFilePath);
        const entries = zip.getEntries();
        if (entries.length > 512) throw new FormatError('Too many files');
        await new Promise((resolve, reject) => {
            zip.extractAllToAsync(savePath, true, (e) => {
                if (e) reject(e);
                else resolve(null);
            });
        });
        await fs.unlink(tmpFilePath);
        await this.processData(savePath);
        return savePath;
    }

    async consume(queue: PQueue<any>) {
        log.info('正在连接 %sjudge/consume-conn', this.config.server_url);
        const res = await this.get('judge/consume-conn/info');
        this.ws = new WebSocket(`${this.config.server_url.replace(/^http/i, 'ws')}judge/consume-conn/websocket?t=${res.body.entropy}`, {
            headers: { cookie: this.config.cookie },
        });
        this.ws.on('message', (data) => {
            const request = JSON.parse(data.toString());
            if (!request.event) {
                request.domainId = request.domain_id;
                request.source = request.type === 1 ? `__record__/${request.rid}` : `${request.domain_id}/${request.pid}`;
                request.meta = {};
                request.config = {
                    type: 'default',
                };
                queue.add(() => new JudgeTask(this, request).handle().catch(console.error));
            }
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
            this.ws.once('open', () => { resolve(null); });
        });
        log.info(`[${this.config.host}] 已连接`);
    }

    async setCookie(cookie: string) {
        this.config.cookie = cookie;
    }

    async login() {
        log.info('[%s] Updating session', this.config.host);
        const res = await this.post('/login', {
            uname: this.config.uname, password: this.config.password, rememberme: 'on',
        }).redirects(0).ok((i) => i.status === 302);
        await this.setCookie(res.headers['set-cookie']);
    }

    async ensureLogin() {
        try {
            await this.get('/judge/noop');
        } catch (e) {
            await this.login();
        }
    }

    async processData(folder: string) { // eslint-disable-line class-methods-use-this
        let files = await fs.readdir(folder);
        if (files.length <= 2) {
            if (files.length === 2) files.splice(files.indexOf('version'), 1);
            const s = fs.statSync(path.resolve(folder, files[0]));
            if (s.isDirectory()) folder = path.resolve(folder, files[0]);
        }
        files = await fs.readdir(folder);
        const iniFile = files.find((i) => i.toLowerCase() === 'config.ini');
        if (iniFile) {
            const file = await fs.readFile(`${folder}/${iniFile}`, 'utf-8');
            await fs.writeFile(`${folder}/config.ini`, file.toLowerCase());
            const input = files.find((i) => i.toLowerCase() === 'input');
            const output = files.find((i) => i.toLowerCase() === 'output');
            if (input) {
                for (const i of await fs.readdir(`${folder}/${input}`)) {
                    if (fs.statSync(`${folder}/${input}/${i}`).size > 64 * 1024 * 1024) {
                        await fs.rename(`${folder}/${input}/${i}`, `${folder}/${i.toLowerCase()}`);
                    } else {
                        const buffer = await fs.readFile(`${folder}/${input}/${i}`);
                        const data = buffer.toString().replace(/\r/g, '');
                        await fs.unlink(`${folder}/${input}/${i}`);
                        await fs.writeFile(`${folder}/${i.toLowerCase()}`, data);
                    }
                }
            }
            if (output) {
                for (const i of await fs.readdir(`${folder}/${output}`)) {
                    await fs.rename(`${folder}/${output}/${i}`, `${folder}/${i.toLowerCase()}`);
                }
            }
        }
    }

    async cacheOpen(source: string, files: string[], next) {
        const [domainId, pid] = source.split('/');
        const domainDir = path.join(getConfig('cache_dir'), this.config.host, domainId);
        const filePath = path.join(domainDir, pid);
        if (domainId === '__record__') return await this.recordPretestData(pid, filePath);
        const version = await this.problemDataVersion(domainId, pid);
        if (fs.existsSync(filePath)) {
            let ver;
            try {
                ver = fs.readFileSync(path.join(filePath, 'version')).toString();
            } catch (e) { /* ignore */ }
            if (version === ver) {
                fs.writeFileSync(path.join(filePath, 'lastUsage'), new Date().getTime().toString());
                return filePath;
            }
            fs.removeSync(filePath);
        }
        fs.ensureDirSync(domainDir);
        await this.problemData(domainId, pid, filePath, 3, next);
        fs.writeFileSync(path.join(filePath, 'version'), version);
        fs.writeFileSync(path.join(filePath, 'lastUsage'), new Date().getTime().toString());
        return filePath;
    }

    async retry(queue: PQueue<any>) {
        this.consume(queue).catch(() => {
            setTimeout(() => {
                this.retry(queue);
            }, 30000);
        });
    }

    dispose() { }
}
