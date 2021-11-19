import path from 'path';
import fs from 'fs-extra';
import Queue from 'p-queue';
import { STATUS } from '@hydrooj/utils/lib/status';
import { check, compileChecker } from '../check';
import compile from '../compile';
import { getConfig } from '../config';
import { CompileError, SystemError } from '../error';
import { run } from '../sandbox';
import signals from '../signals';
import { parseFilename } from '../utils';

const Score = {
    sum: (a: number, b: number) => (a + b),
    max: Math.max,
    min: Math.min,
};

function judgeCase(c, sid: string) {
    return async (ctx, ctxSubtask, runner?: Function) => {
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
                progress: Math.floor((c.id * 100) / ctx.config.count),
            }, c.id);
            return;
        }
        const { filename } = ctx.config;
        const copyIn = { ...ctx.execute.copyIn };
        if (filename) copyIn[`${filename}.in`] = c.input ? { src: c.input } : { content: '' };
        const copyOut = filename ? [`${filename}.out?`] : [];
        const stdin = filename ? null : c.input;
        const stdout = path.resolve(ctx.tmpdir, `${c.id}.out`);
        const stderr = path.resolve(ctx.tmpdir, `${c.id}.err`);
        const res = await run(
            ctx.execute.execute.replace(/\$\{name\}/g, 'code'),
            {
                stdin,
                stdout: filename ? null : stdout,
                stderr,
                copyIn,
                copyOut,
                time: ctxSubtask.subtask.time * ctx.execute.time,
                memory: ctxSubtask.subtask.memory,
            },
        );
        const { code, time_usage_ms, memory_usage_kb } = res;
        let { status } = res;
        if (res.files[`${filename}.out`] || !fs.existsSync(stdout)) {
            fs.writeFileSync(stdout, res.files[`${filename}.out`] || '');
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
                    copyIn: ctx.checker.copyIn,
                    stdin: c.input,
                    stdout: c.output,
                    user_stdout: stdout,
                    user_stderr: stderr,
                    checker: ctx.config.checker,
                    checker_type: ctx.config.checker_type,
                    score: ctxSubtask.subtask.score,
                    detail: ctx.config.detail ?? true,
                });
            }
        } else if (status === STATUS.STATUS_RUNTIME_ERROR && code) {
            if (code < 32) message = signals[code];
            else message = { message: 'Your program returned {0}.', params: [code] };
        }
        await Promise.all([
            fs.remove(stdout),
            fs.remove(stderr),
        ]).catch(() => { /* Ignore file doesn't exist */ });
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
                status,
                score: 0,
                time_ms: time_usage_ms,
                memory_kb: memory_usage_kb,
                message,
            },
            progress: Math.floor((c.id * 100) / ctx.config.count),
        }, c.id);
    };
}

function judgeSubtask(subtask, sid: string) {
    return async (ctx) => {
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

export const judge = async (ctx) => {
    if (!ctx.config.subtasks.length) throw new SystemError('Problem data not found.');
    ctx.next({ status: STATUS.STATUS_COMPILING });
    if (ctx.config.template) {
        if (ctx.config.template[ctx.lang]) {
            const tpl = ctx.config.template[ctx.lang];
            ctx.code = tpl[0] + ctx.code + tpl[1];
        } else throw new CompileError('Language not supported by provided templates');
    }
    [ctx.execute, ctx.checker] = await Promise.all([
        (() => {
            const copyIn = {};
            for (const file of ctx.config.user_extra_files) {
                copyIn[parseFilename(file)] = { src: file };
            }
            return compile(ctx.getLang(ctx.lang), ctx.code, 'code', copyIn, ctx.next);
        })(),
        (() => {
            if (!ctx.config.checker_type || ['default', 'strict'].includes(ctx.config.checker_type)) {
                return { execute: '', copyIn: {}, clean: () => Promise.resolve(null) };
            }
            const copyIn = {};
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
