import { basename, join } from 'path';
import { fs } from '@hydrooj/utils';
import { STATUS } from '@hydrooj/utils/lib/status';
import type {
    FileInfo, JudgeMeta, JudgeResultBody, TestCase,
} from 'hydrooj';
import readCases from './cases';
import checkers from './checkers';
import compile, { compileLocalFile } from './compile';
import { getConfig } from './config';
import { CompileError, FormatError } from './error';
import {
    Execute, JudgeRequest, ParsedConfig, Session,
} from './interface';
import judge from './judge';
import { Logger } from './log';
import { CopyIn, CopyInFile, runQueued } from './sandbox';
import { compilerText, md5 } from './utils';

const logger = new Logger('judge');

export class JudgeTask {
    stat: Record<string, Date> = Object.create(null);
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
                trusted: this.request.trusted && this.session.config.trusted,
                lang: this.lang,
                langConfig: (this.request.type === 'generate' || ['objective', 'submit_answer'].includes(this.request.config.type))
                    ? null : this.session.getLang(this.lang),
            },
        );
        this.stat.judge = new Date();
        const type = this.request.contest?.toString() === '000000000000000000000000' ? 'run'
            : this.request.type === 'generate' ? 'generate'
                : this.files?.hack ? 'hack'
                    : this.config.type || 'default';
        if (!judge[type]) throw new FormatError('Unrecognized problemType: {0}', [type]);
        await judge[type].judge(this);
    }

    async compile(lang: string, code: CopyInFile) {
        const copyIn = Object.fromEntries(
            (this.config.user_extra_files || []).map((i) => [basename(i), { src: i }]),
        ) as CopyIn;
        const result = await compile(this.session.getLang(lang), code, copyIn, this.next);
        this.clean.push(result.clean);
        return result;
    }

    async compileLocalFile(type: 'interactor' | 'validator' | 'checker' | 'generator' | 'std', file: string, checkerType?: string) {
        if (type === 'checker' && ['default', 'strict'].includes(checkerType)) return { execute: '', copyIn: {}, clean: () => Promise.resolve(null) };
        if (type === 'checker' && !checkers[checkerType]) throw new FormatError('Unknown checker type {0}.', [checkerType]);
        const withTestlib = type !== 'std' && (type !== 'checker' || checkerType === 'testlib');
        const extra = type === 'std' ? this.config.user_extra_files : this.config.judge_extra_files;
        const copyIn = {
            user_code: this.code,
            ...Object.fromEntries(
                (extra || []).map((i) => [basename(i), { src: i }]),
            ),
        } as CopyIn;
        if (!file.startsWith('/')) file = join(this.folder, file);
        const result = await compileLocalFile(file, type, this.session.getLang, copyIn, withTestlib, this.next);
        this.clean.push(result.clean);
        return result;
    }

    async runAnalysis(execute: Execute, input: CopyInFile) {
        const langConfig = this.session.getLang(this.lang);
        if (!langConfig.analysis) return;
        try {
            const r = await runQueued(langConfig.analysis, {
                copyIn: {
                    ...execute.copyIn,
                    input,
                    [langConfig.code_file || 'foo']: this.code,
                    compile: { content: langConfig.compile || '' },
                    execute: { content: langConfig.execute || '' },
                },
                env: this.env,
                time: 5000,
                memory: 256,
            });
            const out = r.stdout.toString();
            if (out.length) this.next({ compilerText: out.substring(0, 1024) });
            if (process.env.DEV) console.log(r);
        } catch (e) {
            logger.info('Failed to run analysis');
            logger.error(e);
        }
    }
}
