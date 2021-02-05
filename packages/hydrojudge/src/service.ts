// Hydro Integration
/* eslint-disable no-await-in-loop */
import 'hydrooj';
import path from 'path';
import { argv } from 'yargs';
import { ObjectID } from 'bson';
import fs from 'fs-extra';
import { noop } from 'lodash';
import { Logger } from 'hydrooj/dist/logger';
import * as monitor from 'hydrooj/dist/service/monitor';
import * as tmpfs from './tmpfs';
import { FormatError, CompileError, SystemError } from './error';
import { STATUS_COMPILE_ERROR, STATUS_SYSTEM_ERROR } from './status';
import { compilerText } from './utils';
import readYamlCases from './cases';
import { getConfig } from './config';

declare module 'hydrooj/dist/interface' {
    interface SystemKeys {
        'hydrojudge.langs': string,
        'hydrojudge.cache_dir': string,
        'hydrojudge.tmp_dir': string,
        'hydrojudge.tmpfs_size': string,
        'hydrojudge.retry_delay_sec': number,
        'hydrojudge.sandbox_host': string,
        'hydrojudge.testcases_max': number,
        'hydrojudge.total_time_limit': number,
        'hydrojudge.parallelism': number,
    }
}

const logger = new Logger('judge');

async function postInit() {
    // Only start a single daemon
    if (!global.Hydro.isFirstWorker) return;
    const judge = require('./judge');
    const sysinfo = require('./sysinfo');

    const { task } = global.Hydro.model;
    const { storage } = global.Hydro.service;
    const _judge = global.Hydro.handler.judge as any;

    const info = await sysinfo.get();
    monitor.updateJudger(info);
    setInterval(async () => {
        const [mid, inf] = await sysinfo.update();
        monitor.updateJudger({ mid, ...inf });
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

    async function cacheOpen(domainId: string, pid: string, files: any[]) {
        const filePath = path.join(getConfig('cache_dir'), domainId, pid);
        await fs.ensureDir(filePath);
        if (!files.length) throw new SystemError('Problem data not found.');
        let etags: Record<string, string> = {};
        try {
            etags = JSON.parse(fs.readFileSync(path.join(filePath, 'etags')).toString());
        } catch (e) { /* ignore */ }
        const version = {};
        for (const file of files) {
            version[file.name] = file.etag;
            if (etags[file.name] !== file.etag) {
                await storage.get(`problem/${domainId}/${pid}/testdata/${file.name}`, path.join(filePath, file.name));
            }
        }
        fs.writeFileSync(path.join(filePath, 'etags'), JSON.stringify(version));
        await processData(filePath).catch(noop);
        return filePath;
    }

    function getNext(that) {
        that.nextId = 1;
        that.nextWaiting = [];
        return (data, id = 0) => {
            logger.debug('Next: %d %o', id, data);
            data.domainId = that.domainId;
            data.rid = new ObjectID(that.rid);
            if (data.time_ms) data.time = data.time_ms;
            if (data.memory_kb) data.memory = data.memory_kb;
            if (data.compiler_text) data.compilerText = data.compiler_text;
            delete data.time_ms;
            delete data.memory_kb;
            delete data.compiler_text;
            if (data.case) {
                data.case = {
                    status: data.case.status,
                    time: data.case.time_ms || data.case.time,
                    memory: data.case.memory_kb || data.case.memory,
                    message: data.case.message || data.case.judgeText || '',
                };
            }
            if (id) {
                if (id === that.nextId) {
                    _judge.next(data);
                    that.nextId++;
                    let t = true;
                    while (t) {
                        t = false;
                        for (const i in that.nextWaiting) {
                            if (that.nextId === that.nextWaiting[i].id) {
                                _judge.next(that.nextWaiting[i].data);
                                that.nextId++;
                                that.nextWaiting.splice(i, 1);
                                t = true;
                            }
                        }
                    }
                } else that.nextWaiting.push({ data, id });
            } else _judge.next(data);
        };
    }

    function getEnd(domainId: string, rid: string) {
        return (data) => {
            data.key = 'end';
            data.rid = new ObjectID(rid);
            data.domainId = domainId;
            data.time = data.time_ms ?? data.time;
            data.memory = data.memory_kb ?? data.memory;
            logger.info('End: status=%d score=%d time=%dms memory=%dkb', data.status, data.score, data.time, data.memory);
            _judge.end(data);
        };
    }

    class JudgeTask {
        stat: any;
        request: any;
        event: string;
        pid: string;
        rid: string;
        domainId: string;
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

        constructor(request) {
            this.stat = {};
            this.stat.receive = new Date();
            this.request = request;
            logger.debug('%o', request);
        }

        async handle() {
            try {
                this.stat.handle = new Date();
                this.pid = (this.request.pid || 'unknown').toString();
                this.rid = this.request.rid.toString();
                this.domainId = this.request.domainId;
                this.lang = this.request.lang;
                this.code = this.request.code;
                this.data = this.request.data;
                this.config = this.request.config;
                this.input = this.request.input;
                this.next = getNext(this);
                this.end = getEnd(this.domainId, this.rid);
                this.tmpdir = path.resolve(getConfig('tmp_dir'), this.rid);
                this.clean = [];
                fs.ensureDirSync(this.tmpdir);
                tmpfs.mount(this.tmpdir, getConfig('tmpfs_size'));
                logger.info(`Submission: ${this.rid}`, { pid: this.pid });
                if (typeof this.input === 'string') await this.run();
                else await this.submission();
            } catch (e) {
                if (e instanceof CompileError) {
                    this.next({ compiler_text: compilerText(e.stdout, e.stderr) });
                    this.end({
                        status: STATUS_COMPILE_ERROR, score: 0, time_ms: 0, memory_kb: 0,
                    });
                } else if (e instanceof FormatError) {
                    this.next({ message: { message: e.message, params: e.params } });
                    this.end({
                        status: STATUS_SYSTEM_ERROR, score: 0, time_ms: 0, memory_kb: 0,
                    });
                } else {
                    logger.error(e);
                    this.next({ message: { message: e.message, params: e.params, ...argv.debug ? { stack: e.stack } : {} } });
                    this.end({
                        status: STATUS_SYSTEM_ERROR, score: 0, time_ms: 0, memory_kb: 0,
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
            this.folder = await cacheOpen(this.domainId, this.pid, this.data);
            this.stat.read_cases = new Date();
            this.config = await readYamlCases(
                this.folder,
                this.config,
                { next: this.next },
            );
            this.stat.judge = new Date();
            await judge[this.config.type || 'default'].judge(this);
        }

        async run() {
            this.stat.judge = new Date();
            await judge.run.judge(this);
        }
    }

    task.consume({ type: 'judge' }, (t) => (new JudgeTask(t)).handle().catch(logger.error));
}

global.Hydro.service.bus.once('app/started', postInit);
