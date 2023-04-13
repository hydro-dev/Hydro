import { fs } from '@hydrooj/utils';
import { LangConfig } from '@hydrooj/utils/lib/lang';
import { STATUS } from '@hydrooj/utils/lib/status';
import type {
    FileInfo, JudgeMeta, JudgeRequest, JudgeResultBody, TestCase,
} from 'hydrooj';
import readCases from './cases';
import { getConfig } from './config';
import { CompileError, FormatError } from './error';
import { NextFunction, ParsedConfig } from './interface';
import judge from './judge';
import { Logger } from './log';
import { CopyInFile } from './sandbox';
import { compilerText, md5 } from './utils';

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
    input?: string;
    clean: (() => Promise<any>)[] = [];
    data: FileInfo[];
    folder: string;
    config: ParsedConfig;
    meta: JudgeMeta;
    files?: Record<string, string>;
    next: (data: Partial<JudgeResultBody>) => void;
    end: (data: Partial<JudgeResultBody>) => void;
    env: Record<string, string>;
    callbackCache?: TestCase[];

    constructor(public session: Session, public request: JudgeRequest) {
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
            this.meta = this.request.meta;
            this.files = this.request.files;
            this.input = this.request.input;
            let tid = this.request.contest?.toString() || '';
            if (tid === '000000000000000000000000') tid = '';
            this.env = {
                HYDRO_DOMAIN: this.request.domainId.toString(),
                HYDRO_RECORD: this.rid,
                HYDRO_LANG: this.lang,
                HYDRO_USER: (this.request.uid || 0).toString(),
                HYDRO_CONTEST: tid,
            };
            this.next = this.session.getNext(this);
            this.end = this.session.getEnd(this);
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
            // eslint-disable-next-line no-await-in-loop
            for (const clean of this.clean) await clean()?.catch(() => null);
        }
    }

    async doSubmission() {
        this.stat.cache_start = new Date();
        this.folder = await this.session.cacheOpen(this.source, this.data, this.next);
        if (this.files?.code) {
            const target = await this.session.fetchFile(this.files?.code);
            this.code = { src: target };
            this.clean.push(() => fs.remove(target));
        }
        this.stat.read_cases = new Date();
        this.config = await readCases(
            this.folder,
            {
                detail: this.session.config.detail,
                ...this.request.config,
            },
            {
                next: this.next,
                isSelfSubmission: this.meta.problemOwner === this.request.uid,
                key: md5(`${this.source}/${getConfig('secret')}`),
                lang: this.lang,
                langConfig: ['objective', 'submit_answer'].includes(this.request.config.type) ? null : this.session.getLang(this.lang),
            },
        );
        this.stat.judge = new Date();
        const type = this.request.contest?.toString() === '000000000000000000000000' ? 'run'
            : this.files?.hack
                ? 'hack'
                : this.config.type || 'default';
        if (!judge[type]) throw new FormatError('Unrecognized problemType: {0}', [type]);
        await judge[type].judge(this);
    }
}
