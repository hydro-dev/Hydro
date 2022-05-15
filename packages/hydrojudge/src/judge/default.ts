import Queue from 'p-queue';
import { STATUS } from '@hydrooj/utils/lib/status';
import { check, compileChecker } from '../check';
import compile from '../compile';
import { getConfig } from '../config';
import { CompileError, FormatError } from '../error';
import { Logger } from '../log';
import { del, run } from '../sandbox';
import { CmdFile } from '../sandbox/interface';
import signals from '../signals';
import { NormalizedCase, NormalizedSubtask, parseFilename } from '../utils';
import { Context, ContextSubTask } from './interface';

const Score = {
    sum: (a: number, b: number) => (a + b),
    max: Math.max,
    min: Math.min,
};

const logger = new Logger('judge/default');

function judgeCase(c: NormalizedCase, sid: string) {
    return async (ctx: Context, ctxSubtask: ContextSubTask, runner?: Function) => {
        if (ctx.errored || (ctx.failed[sid] && ctxSubtask.subtask.type === 'min')
            || (ctxSubtask.subtask.type === 'max' && ctxSubtask.score === ctxSubtask.subtask.score)
            || ((ctxSubtask.subtask.if || []).filter((i) => ctx.failed[i]).length)
        ) {
            ctx.next({
                case: {
                    status: STATUS.STATUS_CANCELED,
                    score: 0,
                    time: 0,
                    memory: 0,
                    message: '',
                },
                addProgress: 100 / ctx.config.count,
            }, c.id);
            return;
        }
        const { filename } = ctx.config;
        const copyIn = { ...ctx.execute.copyIn };
        if (filename) copyIn[`${filename}.in`] = c.input ? { src: c.input } : { content: '' };
        const copyOutCached = filename ? [`${filename}.out?`] : [];
        const stdin = filename ? null : c.input;
        const res = await run(
            ctx.execute.execute,
            {
                stdin,
                copyIn,
                copyOutCached,
                time: ctxSubtask.subtask.time * ctx.execute.time,
                memory: ctxSubtask.subtask.memory,
                cacheStdoutAndStderr: true,
            },
        );
        const { code, time_usage_ms, memory_usage_kb } = res;
        let { status } = res;
        let stdout: CmdFile = { fileId: res.fileIds[filename ? `${filename}.out` : 'stdout'] };
        const stderr = { fileId: res.fileIds['stderr'] };
        if (!stdout.fileId) stdout = { content: '' };
        let message: any = '';
        let score = 0;
        if (status === STATUS.STATUS_ACCEPTED) {
            if (time_usage_ms > ctxSubtask.subtask.time * ctx.execute.time) {
                status = STATUS.STATUS_TIME_LIMIT_EXCEEDED;
            } else if (memory_usage_kb > ctxSubtask.subtask.memory * 1024) {
                status = STATUS.STATUS_MEMORY_LIMIT_EXCEEDED;
            } else {
                [status, score, message] = await check({
                    execute: ctx.checker.execute,
                    copyIn: ctx.checker.copyIn || {},
                    input: { src: c.input },
                    output: { src: c.output },
                    user_stdout: stdout,
                    user_stderr: stderr,
                    checker_type: ctx.config.checker_type,
                    score: c.score,
                    detail: ctx.config.detail ?? true,
                    env: { ...ctx.env, HYDRO_TESTCASE: c.id.toString() },
                });
            }
        } else if (status === STATUS.STATUS_RUNTIME_ERROR && code) {
            if (code < 32) message = signals[code];
            else message = { message: 'Your program returned {0}.', params: [code] };
        }
        await Promise.all(
            Object.values(res.fileIds).map((id) => del(id)),
        ).catch(() => { /* Ignore file doesn't exist */ });
        if (runner && ctx.rerun && status === STATUS.STATUS_TIME_LIMIT_EXCEEDED) {
            ctx.rerun--;
            await runner(ctx, ctxSubtask);
            return;
        }
        ctxSubtask.score = Score[ctxSubtask.subtask.type](ctxSubtask.score, score);
        ctxSubtask.status = Math.max(ctxSubtask.status, status);
        if (ctxSubtask.status > STATUS.STATUS_ACCEPTED) ctx.failed[sid] = true;
        ctx.total_time_usage_ms += time_usage_ms;
        ctx.total_memory_usage_kb = Math.max(ctx.total_memory_usage_kb, memory_usage_kb);
        ctx.next({
            case: {
                subtaskId: ctxSubtask.subtask.id,
                status,
                score,
                time: time_usage_ms,
                memory: memory_usage_kb,
                message,
            },
            addProgress: 100 / ctx.config.count,
        }, c.id);
        if ([STATUS.STATUS_WRONG_ANSWER, STATUS.STATUS_RUNTIME_ERROR].includes(status)) {
            const langConfig = ctx.getLang(ctx.lang);
            if (langConfig.analysis && !ctx.analysis) {
                ctx.analysis = true;
                try {
                    const r = await run(langConfig.analysis, {
                        copyIn: {
                            ...copyIn,
                            input: stdin ? { src: stdin } : { content: '' },
                            [langConfig.code_file || 'foo']: ctx.code,
                            compile: { content: langConfig.compile || '' },
                            execute: { content: langConfig.execute || '' },
                        },
                        time: 5000,
                        memory: 256,
                        env: ctx.env,
                    });
                    const out = r.stdout.toString();
                    if (out.length) ctx.next({ compilerText: out.substring(0, 1024) });
                    if (process.env.DEV) console.log(r);
                } catch (e) {
                    logger.info('Failed to run analysis');
                    logger.error(e);
                }
            }
        }
    };
}

function judgeSubtask(subtask: NormalizedSubtask, sid: string) {
    return async (ctx: Context) => {
        subtask.type = subtask.type || 'min';
        const ctxSubtask = {
            subtask,
            status: 0,
            score: subtask.type === 'min'
                ? subtask.score
                : 0,
        };
        const cases = [];
        for (const cid in subtask.cases) {
            const runner = judgeCase(subtask.cases[cid], sid);
            cases.push(ctx.queue.add(() => runner(ctx, ctxSubtask, runner)));
        }
        await Promise.all(cases).catch((e) => {
            ctx.errored = true;
            throw e;
        });
        ctx.total_status = Math.max(ctx.total_status, ctxSubtask.status);
        return ctxSubtask.score;
    };
}

export const judge = async (ctx: Context, startPromise = Promise.resolve()) => {
    if (!ctx.config.subtasks.length) throw new FormatError('Problem data not found.');
    startPromise.then(() => ctx.next({ status: STATUS.STATUS_COMPILING }));
    if (ctx.config.template && 'content' in ctx.code) {
        if (ctx.config.template[ctx.lang]) {
            const tpl = ctx.config.template[ctx.lang];
            ctx.code.content = tpl[0] + ctx.code.content + tpl[1];
        } else throw new CompileError('Language not supported by provided templates');
    }
    [ctx.execute, ctx.checker] = await Promise.all([
        compile(
            ctx.getLang(ctx.lang), ctx.code,
            Object.fromEntries(
                (ctx.config.user_extra_files || []).map((i) => [i.split('/').pop(), { src: i }]),
            ),
            ctx.next,
        ),
        compileChecker(
            ctx.getLang,
            ctx.config.checker_type,
            ctx.config.checker,
            {
                user_code: ctx.code,
                ...Object.fromEntries(
                    (ctx.config.judge_extra_files || []).map((i) => [parseFilename(i), { src: i }]),
                ),
            },
        ),
    ]);
    ctx.clean.push(ctx.execute.clean, ctx.checker.clean);
    await startPromise;
    ctx.next({ status: STATUS.STATUS_JUDGING, progress: 0 });
    const tasks = [];
    ctx.total_status = 0;
    ctx.total_score = 0;
    ctx.total_memory_usage_kb = 0;
    ctx.total_time_usage_ms = 0;
    ctx.rerun = getConfig('rerun') || 0;
    ctx.queue = new Queue({ concurrency: getConfig('singleTaskParallelism') });
    ctx.failed = {};
    for (const sid in ctx.config.subtasks) tasks.push(judgeSubtask(ctx.config.subtasks[sid], sid)(ctx));
    const scores = await Promise.all(tasks);
    for (const sid in ctx.config.subtasks) {
        let effective = true;
        for (const required of ctx.config.subtasks[sid].if || []) {
            if (ctx.failed[required.toString()]) effective = false;
        }
        if (effective) ctx.total_score += scores[sid];
    }
    ctx.stat.done = new Date();
    if (process.env.DEV) ctx.next({ message: JSON.stringify(ctx.stat) });
    ctx.end({
        status: ctx.total_status,
        score: ctx.total_score,
        time: Math.floor(ctx.total_time_usage_ms * 1000000) / 1000000,
        memory: ctx.total_memory_usage_kb,
    });
};
