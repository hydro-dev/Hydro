// Hydro Integration
/* eslint-disable no-await-in-loop */
import 'hydrooj';

import path from 'path';
import fs from 'fs-extra';
import { noop } from 'lodash';
import { ObjectID } from 'mongodb';
import { STATUS } from '@hydrooj/utils/lib/status';
import { Logger } from 'hydrooj/src/logger';
import * as monitor from 'hydrooj/src/service/monitor';
import readCases from './cases';
import { getConfig } from './config';
import { CompileError, FormatError, SystemError } from './error';
import * as sysinfo from './sysinfo';
import * as tmpfs from './tmpfs';
import { compilerText, md5 } from './utils';

declare module 'hydrooj/src/interface' {
    interface SystemKeys {
        'hydrojudge.cache_dir': string,
        'hydrojudge.tmp_dir': string,
        'hydrojudge.tmpfs_size': string,
        'hydrojudge.retry_delay_sec': number,
        'hydrojudge.sandbox_host': string,
        'hydrojudge.memoryMax': string,
        'hydrojudge.testcases_max': number,
        'hydrojudge.total_time_limit': number,
        'hydrojudge.parallelism': number,
        'hydrojudge.disable': boolean,
    }
}

const logger = new Logger('judge');

async function postInit() {
    // Only start a single daemon
    if (process.env.NODE_APP_INSTANCE !== '0') return;
    const judge = require('./judge');

    const {
        task, system, setting, storage,
    } = global.Hydro.model;
    const _judge = global.Hydro.handler.judge as any;

    if (system.get('hydrojudge.disable')) return;
    const info = await sysinfo.get();
    monitor.updateJudge(info);
    setInterval(async () => {
        const [mid, inf] = await sysinfo.update();
        monitor.updateJudge({ mid, ...inf });
    }, 1200000);

    async function processData(folder: string) {
        let files = await fs.readdir(folder);
        let ini = false;
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

    async function cacheOpen(source: string, files: any[]) {
        const filePath = path.join(getConfig('cache_dir'), source);
        await fs.ensureDir(filePath);
        if (!files?.length) throw new SystemError('Problem data not found.');
        let etags: Record<string, string> = {};
        try {
            etags = JSON.parse(fs.readFileSync(path.join(filePath, 'etags')).toString());
        } catch (e) { /* ignore */ }
        const version = {};
        const filenames = new Set<string>();
        for (const file of files) {
            filenames.add(file.name);
            version[file.name] = file.etag + file.lastModified;
            if (etags[file.name] !== file.etag + file.lastModified) {
                await storage.get(`problem/${source}/testdata/${file.name}`, path.join(filePath, file.name));
            }
        }
        for (const name in etags) {
            if (!filenames.has(name)) await fs.rm(path.join(filePath, name));
        }
        fs.writeFileSync(path.join(filePath, 'etags'), JSON.stringify(version));
        fs.writeFileSync(path.join(filePath, 'lastUsage'), new Date().getTime().toString());
        await processData(filePath).catch(noop);
        return filePath;
    }

    function getNext(that) {
        return (data, id = 0) => {
            logger.debug('Next: %d %o', id, data);
            data.rid = new ObjectID(that.rid);
            if (data.time_ms) data.time = data.time_ms;
            if (data.memory_kb) data.memory = data.memory_kb;
            if (data.compiler_text) data.compilerText = data.compiler_text;
            delete data.time_ms;
            delete data.memory_kb;
            delete data.compiler_text;
            if (data.case) {
                data.case = {
                    id,
                    status: data.case.status,
                    time: data.case.time_ms || data.case.time,
                    memory: data.case.memory_kb || data.case.memory,
                    message: data.case.message || data.case.judgeText || '',
                };
            }
            _judge.next(data);
        };
    }

    function getEnd(rid: string) {
        return (data) => {
            data.key = 'end';
            data.rid = new ObjectID(rid);
            data.time = data.time_ms ?? data.time;
            data.memory = data.memory_kb ?? data.memory;
            logger.info('End: status=%d score=%d time=%dms memory=%dkb', data.status, data.score, data.time, data.memory);
            _judge.end(data);
        };
    }

    function getLang(lang: string) {
        if (setting.langs[lang]) return setting.langs[lang];
        throw new SystemError('Unsupported language {0}.', [lang]);
    }

    class JudgeTask {
        stat: any;
        request: any;
        event: string;
        source: string;
        rid: string;
        lang: string;
        code: string;
        data: any[];
        config: any;
        input?: string;
        next: (data: any, id?: number) => void;
        end: (data: any) => void;
        tmpdir: string;
        clean: any[];
        folder: string;
        getLang: (lang: string) => any;

        constructor(request) {
            this.stat = {};
            this.stat.receive = new Date();
            this.request = request;
            this.getLang = getLang;
            logger.debug('%o', request);
        }

        async handle() {
            try {
                this.stat.handle = new Date();
                this.rid = this.request.rid.toString();
                this.lang = this.request.lang;
                this.code = this.request.code;
                this.data = this.request.data;
                this.source = this.request.source;
                this.config = this.request.config;
                this.input = this.request.input;
                this.next = getNext(this);
                this.end = getEnd(this.rid);
                this.tmpdir = path.resolve(getConfig('tmp_dir'), this.rid);
                this.clean = [];
                fs.ensureDirSync(this.tmpdir);
                tmpfs.mount(this.tmpdir, getConfig('tmpfs_size'));
                logger.info(`Submission: ${this.source}/${this.rid}`);
                await this.submission();
            } catch (e) {
                if (e instanceof CompileError) {
                    this.next({ compiler_text: compilerText(e.stdout, e.stderr) });
                    this.end({
                        status: STATUS.STATUS_COMPILE_ERROR, score: 0, time_ms: 0, memory_kb: 0,
                    });
                } else if (e instanceof FormatError) {
                    this.next({ message: { message: e.message, params: e.params } });
                    this.end({
                        status: STATUS.STATUS_FORMAT_ERROR, score: 0, time_ms: 0, memory_kb: 0,
                    });
                } else {
                    logger.error(e);
                    this.next({ message: { message: e.message, params: e.params, ...process.env.DEV ? { stack: e.stack } : {} } });
                    this.end({
                        status: STATUS.STATUS_SYSTEM_ERROR, score: 0, time_ms: 0, memory_kb: 0,
                    });
                }
            }
            // eslint-disable-next-line no-await-in-loop
            for (const clean of this.clean) await clean().catch(noop);
            tmpfs.umount(this.tmpdir);
            fs.removeSync(this.tmpdir);
        }

        async submission() {
            this.stat.cache_start = new Date();
            this.folder = await cacheOpen(this.source, this.data);
            this.stat.read_cases = new Date();
            this.config = await readCases(
                this.folder,
                this.config,
                { next: this.next, key: md5(`${this.source}/${getConfig('secret')}`) },
            );
            this.stat.judge = new Date();
            const type = typeof this.input === 'string' ? 'run' : this.config.type || 'default';
            if (!judge[type]) throw new FormatError('Unrecognized problemType: {0}', [type]);
            await judge[type].judge(this);
        }
    }

    task.consume({ type: 'judge' }, (t) => (new JudgeTask(t)).handle().catch(logger.error));
    task.consume({ type: 'judge', priority: { $gt: -50 } }, (t) => (new JudgeTask(t)).handle().catch(logger.error));
}

global.Hydro.service.bus.once('app/started', postInit);
