// Hydro Integration
/* eslint-disable no-await-in-loop */
import 'hydrooj';

import path from 'path';
import fs from 'fs-extra';
import { noop } from 'lodash';
import { ObjectID } from 'mongodb';
import { STATUS } from '@hydrooj/utils/lib/status';
import type { JudgeResultBody } from 'hydrooj';
import { Logger } from 'hydrooj/src/logger';
import * as monitor from 'hydrooj/src/service/monitor';
import readCases, { processTestdata } from './cases';
import { getConfig } from './config';
import { CompileError, FormatError, SystemError } from './error';
import { CopyInFile } from './sandbox/interface';
import * as sysinfo from './sysinfo';
import * as tmpfs from './tmpfs';
import { compilerText, md5 } from './utils';

declare module 'hydrooj/src/interface' {
    interface SystemKeys {
        'hydrojudge.cache_dir': string;
        'hydrojudge.tmp_dir': string;
        'hydrojudge.tmpfs_size': string;
        'hydrojudge.sandbox_host': string;
        'hydrojudge.memoryMax': string;
        'hydrojudge.testcases_max': number;
        'hydrojudge.total_time_limit': number;
        'hydrojudge.parallelism': number;
        'hydrojudge.disable': boolean;
        'hydrojudge.detail': boolean;
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

    async function fetchCodeFile(name: string) {
        const target = path.join('/tmp/hydro/judge', name.replace(/\//g, '_'));
        await storage.get(`submission/${name}`, target);
        return target;
    }

    async function cacheOpen(source: string, files: any[]) {
        const filePath = path.join(getConfig('cache_dir'), source);
        await fs.ensureDir(filePath);
        if (!files?.length) throw new FormatError('Problem data not found.');
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
            if (!filenames.has(name) && fs.existsSync(path.join(filePath, name))) await fs.remove(path.join(filePath, name));
        }
        fs.writeFileSync(path.join(filePath, 'etags'), JSON.stringify(version));
        fs.writeFileSync(path.join(filePath, 'lastUsage'), new Date().getTime().toString());
        await processTestdata(filePath);
        return filePath;
    }

    function getNext(that) {
        return (data: Partial<JudgeResultBody>, id = 0) => {
            logger.debug('Next: %d %o', id, data);
            data.rid = new ObjectID(that.rid);
            if (data.case) data.case.id ||= id;
            _judge.next(data);
        };
    }

    function getEnd(rid: string) {
        return (data: Partial<JudgeResultBody>) => {
            data.key = 'end';
            data.rid = new ObjectID(rid);
            logger.info('End: status=%d score=%d time=%dms memory=%dkb', data.status, data.score, data.time, data.memory);
            _judge.end(data);
        };
    }

    function getLang(lang: string, doThrow = true) {
        if (setting.langs[lang]) return setting.langs[lang];
        if (lang === 'cpp' && setting.langs['cc']) return setting.langs['cc'];
        if (doThrow) throw new SystemError('Unsupported language {0}.', [lang]);
        return null;
    }

    class JudgeTask {
        stat: any;
        request: any;
        event: string;
        source: string;
        rid: string;
        lang: string;
        code: CopyInFile;
        data: any[];
        config: any;
        env: any;
        input?: string;
        next: ReturnType<typeof getNext>;
        end: ReturnType<typeof getEnd>;
        tmpdir: string;
        clean: (() => Promise<any>)[];
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
                this.code = { content: this.request.code };
                this.data = this.request.data;
                this.source = this.request.source;
                this.config = this.request.config;
                this.input = this.request.input;
                let tid = this.request.contest?.toString() || '';
                if (tid === '000000000000000000000000') tid = '';
                this.env = {
                    HYDRO_DOMAIN: this.request.domainId.toString(),
                    HYDRO_RECORD: this.rid,
                    HYDRO_LANG: this.lang,
                    HYDRO_USER: this.request.uid.toString(),
                    HYDRO_CONTEST: tid,
                };
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
                    this.next({ compilerText: compilerText(e.stdout, e.stderr) });
                    this.end({
                        status: STATUS.STATUS_COMPILE_ERROR, score: 0, time: 0, memory: 0,
                    });
                } else if (e instanceof FormatError) {
                    this.next({ message: { message: e.message, params: e.params } });
                    this.end({
                        status: STATUS.STATUS_FORMAT_ERROR, score: 0, time: 0, memory: 0,
                    });
                } else {
                    logger.error(e);
                    this.next({ message: { message: e.message, params: e.params, ...process.env.DEV ? { stack: e.stack } : {} } });
                    this.end({
                        status: STATUS.STATUS_SYSTEM_ERROR, score: 0, time: 0, memory: 0,
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
            if ((this.code as any).content.startsWith('@@hydro_submission_file@@')) {
                const id = (this.code as any).content.split('@@hydro_submission_file@@')[1]?.split('#')?.[0];
                if (!id) throw new SystemError('Submission File Not Found');
                const target = await fetchCodeFile(id);
                this.code = { src: target };
                this.clean.push(() => fs.remove(target));
            }
            this.stat.read_cases = new Date();
            this.config = await readCases(
                this.folder,
                { detail: system.get('hydrojudge.detail'), ...this.config },
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
