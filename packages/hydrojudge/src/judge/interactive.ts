import fs from 'fs-extra';
import Queue from 'p-queue';
import { STATUS } from '@hydrooj/utils/lib/status';
import compile from '../compile';
import { getConfig } from '../config';
import { run } from '../sandbox';
import signals from '../signals';
import { parse } from '../testlib';
import { findFileSync, parseFilename } from '../utils';
import {
    Case, Context, ContextSubTask, SubTask,
} from './interface';

const testlibSrc = findFileSync('@hydrooj/hydrojudge/vendor/testlib/testlib.h');
const Score = {
    sum: (a: number, b: number) => (a + b),
    max: Math.max,
    min: Math.min,
};

function judgeCase(c: Case) {
    return async (ctx: Context, ctxSubtask: ContextSubTask) => {
        ctx.executeInteractor.copyIn.in = c.input ? { src: c.input } : { content: '' };
        ctx.executeInteractor.copyIn.out = c.output ? { src: c.output } : { content: '' };
        const [{ code, time_usage_ms, memory_usage_kb }, resInteractor] = await run([
            {
                execute: ctx.executeUser.execute.replace(/\$\{name\}/g, 'code'),
                copyIn: ctx.executeUser.copyIn,
                time: ctxSubtask.subtask.time * ctx.executeUser.time,
                memory: ctxSubtask.subtask.memory,
            }, {
                execute: `${ctx.executeInteractor.execute.replace(/\$\{name\}/g, 'interactor')} /w/in /w/tout /w/out`,
                copyIn: ctx.executeInteractor.copyIn,
                time: ctxSubtask.subtask.time * 2 * ctx.executeInteractor.time,
                memory: ctxSubtask.subtask.memory * 2,
                copyOut: ['/w/tout?'],
            },
        ]);
        // TODO handle tout (maybe pass to checker?)
        let status: number;
        let score = 0;
        let message: any = '';
        if (time_usage_ms > ctxSubtask.subtask.time * ctx.executeUser.time) {
            status = STATUS.STATUS_TIME_LIMIT_EXCEEDED;
        } else if (memory_usage_kb > ctxSubtask.subtask.memory * 1024) {
            status = STATUS.STATUS_MEMORY_LIMIT_EXCEEDED;
        } else if ((code && code !== 13/* Broken Pipe */) || (code === 13 && !resInteractor.code)) {
            status = STATUS.STATUS_RUNTIME_ERROR;
            if (code < 32) message = signals[code];
            else message = { message: 'Your program returned {0}.', params: [code] };
        } else {
            const result = parse(resInteractor.stderr, ctxSubtask.subtask.score);
            status = result.status;
            score = result.score;
            message = result.message;
            if (resInteractor.code && !(resInteractor.stderr || '').trim().length) message += ` (Interactor exited with code ${resInteractor.code})`;
        }
        ctxSubtask.score = Score[ctxSubtask.subtask.type](ctxSubtask.score, score);
        ctxSubtask.status = Math.max(ctxSubtask.status, status);
        ctx.total_time_usage_ms += time_usage_ms;
        ctx.total_memory_usage_kb = Math.max(ctx.total_memory_usage_kb, memory_usage_kb);
        ctx.next({
            status: STATUS.STATUS_JUDGING,
            case: {
                status,
                score,
                time_ms: time_usage_ms,
                memory_kb: memory_usage_kb,
                message,
            },
            progress: Math.floor((c.id * 100) / ctx.config.count),
        });
    };
}

function judgeSubtask(subtask: SubTask) {
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
            cases.push(ctx.queue.add(() => judgeCase(subtask.cases[cid])(ctx, ctxSubtask)));
        }
        await Promise.all(cases);
        ctx.total_status = Math.max(ctx.total_status, ctxSubtask.status);
        ctx.total_score += ctxSubtask.score;
    };
}

export const judge = async (ctx: Context) => {
    ctx.next({ status: STATUS.STATUS_COMPILING });
    [ctx.executeUser, ctx.executeInteractor] = await Promise.all([
        (() => {
            const copyIn = {};
            for (const file of ctx.config.user_extra_files) {
                copyIn[parseFilename(file)] = { src: file };
            }
            return compile(ctx.getLang(ctx.lang), ctx.code, 'code', copyIn, ctx.next);
        })(),
        (() => {
            const copyIn = { 'testlib.h': { src: testlibSrc } };
            for (const file of ctx.config.judge_extra_files) {
                copyIn[parseFilename(file)] = { src: file };
            }
            return compile(
                ctx.getLang(parseFilename(ctx.config.interactor).split('.')[1].replace('@', '.')),
                fs.readFileSync(ctx.config.interactor).toString(),
                'interactor',
                copyIn,
            );
        })(),
    ]);
    ctx.clean.push(ctx.executeUser.clean, ctx.executeInteractor.clean);
    ctx.next({ status: STATUS.STATUS_JUDGING, progress: 0 });
    const tasks = [];
    ctx.total_status = ctx.total_score = ctx.total_memory_usage_kb = ctx.total_time_usage_ms = 0;
    ctx.queue = new Queue({ concurrency: getConfig('parallelism') });
    for (const sid in ctx.config.subtasks) {
        tasks.push(judgeSubtask(ctx.config.subtasks[sid])(ctx));
    }
    await Promise.all(tasks);
    ctx.stat.done = new Date();
    if (process.env.DEV) ctx.next({ message: JSON.stringify(ctx.stat) });
    ctx.end({
        status: ctx.total_status,
        score: ctx.total_score,
        time_ms: ctx.total_time_usage_ms,
        memory_kb: ctx.total_memory_usage_kb,
    });
};
