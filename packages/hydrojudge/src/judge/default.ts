import Queue from 'p-queue';
import { STATUS } from '@hydrooj/utils/lib/status';
import { check, compileChecker } from '../check';
import compile from '../compile';
import { getConfig } from '../config';
import { CompileError, FormatError } from '../error';
import { del, run } from '../sandbox';
import signals from '../signals';
import { parseFilename } from '../utils';
import {
    Case, Context, ContextSubTask, SubTask,
} from './interface';

const Score = {
    sum: (a: number, b: number) => (a + b),
    max: Math.max,
    min: Math.min,
};

function judgeCase(c: Case, sid: string) {
    return async (ctx: Context, ctxSubtask: ContextSubTask, runner?: Function) => {
        if (ctx.errored || (ctx.failed[sid] && ctxSubtask.subtask.type === 'min')
            || (ctxSubtask.subtask.type === 'max' && ctxSubtask.score === ctxSubtask.subtask.score)
            || ((ctxSubtask.subtask.if || []).filter((i: string) => ctx.failed[i]).length)
        ) {
            ctx.next({
                case: {
                    status: STATUS.STATUS_CANCELED,
                    score: 0,
                    time_ms: 0,
                    memory_kb: 0,
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
        let stdout = { fileId: res.fileIds['stdout'] };
        const stderr = { fileId: res.fileIds['stderr'] };
        if (res.fileIds[`${filename}.out`]) {
            stdout = { fileId: res.fileIds[`${filename}.out`] };
        }
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
                    score: ctxSubtask.subtask.score,
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
        if ([STATUS.STATUS_WRONG_ANSWER, STATUS.STATUS_RUNTIME_ERROR].includes(status) && ctx.config.detail) {
            const langConfig = ctx.getLang(ctx.lang);
            if (langConfig.analysis && !ctx.analysis) {
                ctx.analysis = true;
                run(langConfig.analysis, {
                    copyIn: {
                        ...copyIn,
                        input: stdin ? { src: stdin } : { content: '' },
                        [langConfig.code_file || 'foo']: { content: ctx.code },
                        compile: { content: langConfig.compile || '' },
                        execute: { content: langConfig.execute || '' },
                    },
                    time: 5000,
                    memory: 256,
                }).then((r) => {
                    ctx.next({ compiler_text: r.stdout.toString().substring(0, 1024) });
                    if (process.env.DEV) console.log(r);
                });
            }
        }
        ctxSubtask.score = Score[ctxSubtask.subtask.type](ctxSubtask.score, score);
        ctxSubtask.status = Math.max(ctxSubtask.status, status);
        if (ctxSubtask.status > STATUS.STATUS_ACCEPTED) ctx.failed[sid] = true;
        ctx.total_time_usage_ms += time_usage_ms;
        ctx.total_memory_usage_kb = Math.max(ctx.total_memory_usage_kb, memory_usage_kb);
        ctx.next({
            case: {
                status,
                score: 0,
                time_ms: time_usage_ms,
                memory_kb: memory_usage_kb,
                message,
            },
            addProgress: 100 / ctx.config.count,
        }, c.id);
    };
}

function judgeSubtask(subtask: SubTask, sid: string) {
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
    if (ctx.config.template) {
        if (ctx.config.template[ctx.lang]) {
            const tpl = ctx.config.template[ctx.lang];
            ctx.code = tpl[0] + ctx.code + tpl[1];
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
        (() => {
            if (['default', 'strict'].includes(ctx.config.checker_type || 'default')) {
                return { execute: '', copyIn: {}, clean: () => Promise.resolve(null) };
            }
            const copyIn = { user_code: { content: ctx.code } };
            for (const file of ctx.config.judge_extra_files) {
                copyIn[parseFilename(file)] = { src: file };
            }
            return compileChecker(
                ctx.getLang,
                ctx.config.checker_type,
                ctx.config.checker,
                copyIn,
            );
        })(),
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
    ctx.queue = new Queue({ concurrency: getConfig('parallelism') });
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
        time_ms: Math.floor(ctx.total_time_usage_ms * 1000000) / 1000000,
        memory_kb: ctx.total_memory_usage_kb,
    });
};
