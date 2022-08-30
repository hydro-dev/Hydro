import path from 'path';
import fs from 'fs-extra';
import { noop } from 'lodash';
import { LangConfig } from '@hydrooj/utils/lib/lang';
import { STATUS } from '@hydrooj/utils/lib/status';
import type { JudgeResultBody } from 'hydrooj';
import { Logger } from 'hydrooj/src/logger';
import readCases from './cases';
import { getConfig } from './config';
import { CompileError, FormatError, SystemError } from './error';
import judge from './judge';
import { CopyInFile } from './sandbox';
import * as tmpfs from './tmpfs';
import { compilerText, Lock, md5 } from './utils';

type NextFunction = (data: Partial<JudgeResultBody>) => void;
interface Session {
    getLang: (name: string) => LangConfig;
    getNext: (task: JudgeTask) => NextFunction;
    getEnd: (task: JudgeTask) => NextFunction;
    cacheOpen: (source: string, files: any[], next?: NextFunction) => Promise<string>;
    fetchFile: (target: string) => Promise<string>;
    config: { detail: boolean, host?: string };
}

const logger = new Logger('judge');

export class JudgeTask {
    stat: Record<string, Date>;
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
    next: (data: Partial<JudgeResultBody>) => void;
    end: (data: Partial<JudgeResultBody>) => void;
    env: Record<string, string>;

    constructor(public session: Session, public request) {
        this.stat = {};
        this.stat.receive = new Date();
        logger.debug('%o', request);
    }

    async handle() {
        const host = this.session.config.host || 'local';
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
            this.next = this.session.getNext(this);
            this.end = this.session.getEnd(this);
            this.tmpdir = path.resolve(getConfig('tmp_dir'), this.rid);
            this.clean = [];
            await Lock.acquire(`${host}/${this.source}/${this.rid}`);
            fs.ensureDirSync(this.tmpdir);
            tmpfs.mount(this.tmpdir, getConfig('tmpfs_size'));
            logger.info('Submission: %s/%s/%s', host, this.source, this.rid);
            await this.doSubmission();
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
                logger.error(e);
                this.next({ message: { message: e.message, params: e.params, ...process.env.DEV ? { stack: e.stack } : {} } });
                this.end({
                    status: STATUS.STATUS_SYSTEM_ERROR, score: 0, time: 0, memory: 0,
                });
            }
        } finally {
            Lock.release(`${host}/${this.source}/${this.rid}`);
            // eslint-disable-next-line no-await-in-loop
            for (const clean of this.clean) await clean()?.catch(noop);
            tmpfs.umount(this.tmpdir);
            fs.removeSync(this.tmpdir);
        }
    }

    async doSubmission() {
        this.stat.cache_start = new Date();
        this.folder = await this.session.cacheOpen(this.source, this.data, this.next);
        if ((this.code as any).content.startsWith('@@hydro_submission_file@@')) {
            const id = (this.code as any).content.split('@@hydro_submission_file@@')[1]?.split('#')?.[0];
            if (!id) throw new SystemError('Submission File Not Found');
            const target = await this.session.fetchFile(id);
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
        await judge[type].judge(this);
    }
}
