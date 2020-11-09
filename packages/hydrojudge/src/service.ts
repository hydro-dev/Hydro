// Hydro Integration
/* eslint-disable no-await-in-loop */
import 'hydrooj';
import path from 'path';
import { ObjectID } from 'bson';
import fs from 'fs-extra';
import { homedir, tmpdir } from 'os';
import AdmZip from 'adm-zip';
import { noop } from 'lodash';

declare module 'hydrooj/dist/interface' {
    interface SystemKeys {
        'hydrojudge.langs': string,
    }
}

async function postInit() {
    // Only start a single daemon
    if (!global.Hydro.isFirstWorker) return;
    const { compilerText } = require('./utils');
    const tmpfs = require('./tmpfs');
    const { FormatError, CompileError, SystemError } = require('./error');
    const { STATUS_COMPILE_ERROR, STATUS_SYSTEM_ERROR } = global.Hydro.model.builtin.STATUS;
    const { default: readYamlCases } = require('./cases');
    const judge = require('./judge');
    const sysinfo = require('./sysinfo');

    const { problem, file, task } = global.Hydro.model;
    const _judge = global.Hydro.handler.judge as any;
    const { monitor } = global.Hydro.service;
    const { Logger } = global.Hydro.Logger;
    const logger = new Logger('judge');

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

    async function problemData(domainId: string, pid: string, savePath: string) {
        const tmpFilePath = path.resolve(homedir(), '.cache', 'hydro', 'judge', `download_${domainId}_${pid}`);
        const pdoc = await problem.get(domainId, pid);
        // FIXME doesnt work on copied problems
        // @ts-ignore
        const data = await file.get(pdoc.data);
        if (!data) throw new SystemError('Problem data not found.');
        const w = fs.createWriteStream(tmpFilePath);
        data.pipe(w);
        await new Promise((resolve, reject) => {
            w.on('finish', resolve);
            w.on('error', reject);
        });
        fs.ensureDirSync(path.dirname(savePath));
        const zip = new AdmZip(tmpFilePath);
        const entries = zip.getEntries();
        if (entries.length > 256) throw new FormatError('Too many files');
        await new Promise((resolve, reject) => {
            zip.extractAllToAsync(savePath, true, (e) => {
                if (e) reject(e);
                else resolve();
            });
        });
        await fs.unlink(tmpFilePath);
        await processData(savePath).catch(noop);
        return savePath;
    }

    async function cacheOpen(domainId: string, pid: string, version: string) {
        const filePath = path.join(homedir(), '.cache', 'hydro', 'judge', domainId, pid);
        if (fs.existsSync(filePath)) {
            let ver: string;
            try {
                ver = fs.readFileSync(path.join(filePath, 'version')).toString();
            } catch (e) { /* ignore */ }
            if (version === ver) {
                logger.debug('Cache found at %s', filePath);
                return filePath;
            }
            await fs.remove(filePath);
        }
        logger.debug('Downloading testdata to %s', filePath);
        fs.ensureDirSync(filePath);
        await problemData(domainId, pid, filePath);
        fs.writeFileSync(path.join(filePath, 'version'), version);
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

        data: string;

        config: any;

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
                this.data = (this.request.data || '').toString();
                this.config = this.request.config;
                this.next = getNext(this);
                this.end = getEnd(this.domainId, this.rid);
                this.tmpdir = path.resolve(tmpdir(), 'tmp', this.rid);
                this.clean = [];
                fs.ensureDirSync(this.tmpdir);
                tmpfs.mount(this.tmpdir, '64m');
                logger.info(`Submission: ${this.rid}`, { pid: this.pid });
                if (this.config.input) await this.run();
                else if (this.config.hack) await this.hack();
                else await this.submission();
            } catch (e) {
                if (e instanceof CompileError) {
                    this.next({ compiler_text: compilerText(e.stdout, e.stderr) });
                    this.end({
                        status: STATUS_COMPILE_ERROR, score: 0, time_ms: 0, memory_kb: 0,
                    });
                } else if (e instanceof FormatError) {
                    this.next({ message: `${e.message}\n${JSON.stringify(e.params)}` });
                    this.end({
                        status: STATUS_SYSTEM_ERROR, score: 0, time_ms: 0, memory_kb: 0,
                    });
                } else {
                    logger.error(e);
                    this.next({ message: `${e.message}\n${e.stack}\n${JSON.stringify(e.params)}` });
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

        async hack() {
            this.stat.cache_start = new Date();
            this.folder = await cacheOpen(this.domainId, this.pid, this.data);
            this.stat.read_cases = new Date();
            this.config = await readYamlCases(
                this.folder,
                this.config,
                { next: this.next },
            );
            this.stat.judge = new Date();
            await judge.hack.judge(this);
        }

        async run() {
            this.stat.judge = new Date();
            await judge.run.judge(this);
        }
    }

    task.consume({ type: 'judge' }, (t) => (new JudgeTask(t)).handle().catch(logger.error));
}

global.Hydro.service.bus.once('app/started', postInit);
