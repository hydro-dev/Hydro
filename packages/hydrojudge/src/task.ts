import { basename, join } from 'path';
import { context, SpanStatusCode, trace } from '@opentelemetry/api';
import {
    CompilableSource, FileInfo, JudgeMeta, JudgeResultBody, STATUS, TestCase,
} from '@hydrooj/common';
import { findFileSync, fs } from '@hydrooj/utils';
import readCases from './cases';
import checkers from './checkers';
import compile from './compile';
import { getConfig } from './config';
import { CompileError, FormatError } from './error';
import {
    Execute, JudgeRequest, ParsedConfig, Session,
} from './interface';
import judge from './judge';
import { Logger } from './log';
import {
    CopyIn, CopyInFile, get, PreparedFile, runQueued,
} from './sandbox';
import { compilerText, Lock, md5 } from './utils';

const logger = new Logger('judge');

const testlibFile = {
    src: findFileSync('@hydrooj/hydrojudge/vendor/testlib/testlib.h'),
};

export class JudgeTask {
    source: string;
    rid: string;
    lang: string;
    code: CopyInFile;
    input?: string[];
    finished: boolean = false;
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
    compileCache: Record<string, Pick<Execute, 'execute' | 'copyIn' | typeof Symbol.asyncDispose>> = {};
    tracer = trace.getTracer('hydrojudge');
    span = this.tracer.startSpan('judge.task');
    mainContext = trace.setSpan(context.active(), this.span);

    constructor(public session: Session, public request: JudgeRequest) {
        logger.debug('%o', request);
    }

    startChildSpan(name: string, attributes?: Record<string, any>) {
        const span = this.tracer.startSpan(name, { attributes }, this.mainContext);
        span[Symbol.dispose] = () => span.end();
        return span as typeof span & { [Symbol.dispose]: () => void };
    }

    async handle() {
        const host = this.session.config.host || 'local';
        try {
            this.rid = this.request.rid.toString();
            this.lang = this.request.lang;
            this.code = { content: this.request.code };
            this.data = this.request.data;
            this.source = this.request.source;
            this.meta = this.request.meta;
            this.files = this.request.files;
            this.input = Array.isArray(this.request.input) ? this.request.input : [this.request.input || ''];
            let tid = this.request.contest?.toString() || '';
            if (tid === '000000000000000000000000') tid = '';
            this.env = {
                HYDRO_DOMAIN: this.request.domainId.toString(),
                HYDRO_RECORD: this.rid,
                HYDRO_LANG: this.lang,
                HYDRO_USER: (this.request.uid || 0).toString(),
                HYDRO_CONTEST: tid,
            };
            this.span.setAttributes({
                host,
                rid: this.rid,
                source: this.source,
                lang: this.lang,
                tid,
            });
            Object.assign(this, this.session.getReporter(this));
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
                this.span.recordException(e);
                logger.error(e);
                this.next({ message: { message: e.message, params: e.params, ...process.env.DEV ? { stack: e.stack } : {} } });
                this.end({
                    status: STATUS.STATUS_SYSTEM_ERROR, score: 0, time: 0, memory: 0,
                });
            }
        } finally {
            this.finished = true;
            // eslint-disable-next-line no-await-in-loop
            for (const clean of this.clean) await clean()?.catch(() => null);
            this.span.end();
        }
    }

    async cacheOpen(source: string, files: FileInfo[]) {
        // Backward compatibility for vj4
        if ((this.session as any).cacheOpen) return (this.session as any).cacheOpen(source, files);
        using span = this.startChildSpan('judge.cacheOpen', { source, fileCount: files?.length || 0 });
        const host = this.session.config?.host || 'local';
        const filePath = join(getConfig('cache_dir'), host, source);
        await Lock.acquire(filePath);
        try {
            await fs.ensureDir(filePath);
            if (!files?.length) throw new FormatError('Problem data not found.');
            let etags: Record<string, string> = {};
            try {
                etags = JSON.parse(await fs.readFile(join(filePath, 'etags'), 'utf-8'));
            } catch (e) { /* ignore */ }
            this.compileCache = etags['*cache'] as any || {};
            delete etags['*cache'];
            const version = {};
            const filenames = [];
            const allFiles = new Set<string>();
            for (const file of files) {
                allFiles.add(file.name);
                version[file.name] = file.etag + file.lastModified;
                if (etags[file.name] !== file.etag + file.lastModified) filenames.push(file.name);
            }
            const allFilesToRemove = Object.keys(etags).filter((name) => !allFiles.has(name) && fs.existsSync(join(filePath, name)));
            await Promise.all(allFilesToRemove.map((name) => fs.remove(join(filePath, name))));
            if (filenames.length) {
                span.setAttribute('files', filenames);
                logger.info(`Getting problem data: ${this.session?.config.host || 'local'}/${source}`);
                this.next({ message: 'Syncing testdata, please wait...' });
                this.mainContext = trace.setSpan(context.active(), span);
                await this.session.fetchFile(source, Object.fromEntries(
                    files.filter((i) => filenames.includes(i.name))
                        .map((i) => [i.name, join(filePath, i.name)]),
                ), this);
                this.compileCache = {};
            }
            if (allFilesToRemove.length || filenames.length) {
                await fs.writeFile(join(filePath, 'etags'), JSON.stringify(version));
            }
            await fs.writeFile(join(filePath, 'lastUsage'), Date.now().toString());
            return filePath;
        } catch (e) {
            span.recordException(e);
            logger.warn('CacheOpen Fail: %s %o %o', source, files, e);
            throw e;
        } finally {
            this.mainContext = trace.setSpan(context.active(), this.span);
            Lock.release(filePath);
        }
    }

    async doSubmission() {
        this.folder = await this.cacheOpen(this.source, this.data);
        if (this.files?.code) {
            const target = await this.session.fetchFile(null, { [this.files.code]: '' }, this);
            this.code = { src: target };
            this.clean.push(() => fs.remove(target));
        }
        using readCasesSpan = this.startChildSpan('judge.readCases', { folder: this.folder, lang: this.lang });
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
        readCasesSpan.end();
        const type = this.request.contest?.toString() === '000000000000000000000000' ? 'run'
            : this.request.type === 'generate' ? 'generate'
                : this.files?.hack ? 'hack'
                    : this.config.type || 'default';
        if (!judge[type]) throw new FormatError('Unrecognized problemType: {0}', [type]);
        using executeSpan = this.startChildSpan('judge.execute', { judgeType: type });
        this.mainContext = trace.setSpan(context.active(), executeSpan);
        await judge[type].judge(this);
    }

    async pushClean(f: () => any | Promise<any>) {
        if (this.finished) await f().catch(() => null);
        else this.clean.push(f);
    }

    async compile(lang: string, code: CopyInFile) {
        using compileSpan = this.startChildSpan('judge.compile', { lang });
        const copyIn = Object.fromEntries(
            (this.config.user_extra_files || []).map((i) => [basename(i), { src: i }]),
        ) as CopyIn;
        const result = await compile(this.session.getLang(lang), code, copyIn, this.next);
        compileSpan.setStatus({ code: SpanStatusCode.OK });
        await this.pushClean(result.clean);
        return result;
    }

    async compileLocalFile(
        type: 'interactor' | 'validator' | 'checker' | 'generator' | 'manager' | 'std',
        source: CompilableSource, checkerType?: string,
    ): Promise<Execute> {
        if (type === 'checker' && ['default', 'strict'].includes(checkerType)) {
            return {
                execute: '',
                copyIn: {},
                clean: () => Promise.resolve(null),
                [Symbol.asyncDispose]: () => Promise.resolve(null),
            };
        }
        if (type === 'checker' && !checkers[checkerType]) throw new FormatError('Unknown checker type {0}.', [checkerType]);
        if (this.compileCache?.[type]) {
            return {
                ...this.compileCache[type],
                clean: () => Promise.resolve(null),
            };
        }
        using span = this.startChildSpan('judge.compileLocalFile', { type, checkerType: checkerType || '', cached: false });
        const withTestlib = type !== 'std' && (type !== 'checker' || checkerType === 'testlib');
        const extra = type === 'std' ? this.config.user_extra_files : this.config.judge_extra_files;
        const copyIn = {
            ...Object.fromEntries(
                (extra || []).map((i) => [basename(i), { src: i }]),
            ),
            ...(withTestlib ? { 'testlib.h': testlibFile } : {}),
        } as CopyIn;
        let [file, langId] = typeof source === 'string' ? [source, 'auto'] : [source.file, source.lang];
        if (!file.startsWith('/')) file = join(this.folder, file);
        let lang;
        if (langId === 'auto') {
            const s = file.replace('@', '.').split('.');
            langId = s.pop();
            while (s.length) {
                lang = this.session.getLang(langId, false);
                if (lang) break;
                langId = `${s.pop()}.${langId}`;
            }
        } else lang = this.session.getLang(langId, false);
        if (!lang) throw new FormatError(`Unknown ${type} language.`);
        span.setAttribute('lang', langId);
        // TODO cache compiled binary
        const result = await compile(lang, { src: file }, copyIn);
        if (!result._cacheable) {
            await this.pushClean(result.clean);
            return result;
        }
        span.setAttribute('cacheable', true);
        await Lock.acquire(this.folder);
        try {
            const loc = join(this.folder, `_${type}.cache`);
            const newCopyIn = { ...result.copyIn, [result._cacheable]: { src: loc } };
            // compiled checker should no longer need header file
            // delete this copyIn as it's shipped with hydrojudge and may disappear after upgrade
            delete newCopyIn['testlib.h'];
            this.compileCache[type] = {
                execute: result.execute,
                copyIn: newCopyIn,
                [Symbol.asyncDispose]: () => Promise.resolve(null),
            };
            await get((result.copyIn[result._cacheable] as PreparedFile).fileId, loc);
            const currEtag = await fs.readFile(join(this.folder, 'etags'), 'utf-8');
            await fs.writeFile(join(this.folder, 'etags'), JSON.stringify({ ...JSON.parse(currEtag), '*cache': this.compileCache }));
        } finally {
            await this.pushClean(result.clean);
            Lock.release(this.folder);
        }
        return result;
    }

    async runAnalysis(execute: Execute, input: CopyInFile) {
        const langConfig = this.session.getLang(this.lang);
        if (!langConfig.analysis) return;
        using span = this.startChildSpan('judge.runAnalysis', { lang: this.lang });
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
            }, `analysis[${this.lang}]<${this.rid}>`, 5);
            const out = r.stdout.toString();
            if (out.length) this.next({ compilerText: out.substring(0, 1024) });
            if (process.env.DEV) console.log(r);
        } catch (e) {
            span.recordException(e);
            logger.info('Failed to run analysis');
            logger.error(e);
        }
    }
}
