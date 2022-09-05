import Queue from 'p-queue';
import { STATUS } from '@hydrooj/utils/lib/status';
import type { JudgeResultBody } from 'hydrooj';
import { getConfig } from './config';
import { FormatError } from './error';
import { Context, ContextSubTask } from './judge/interface';
import { NormalizedCase, NormalizedSubtask } from './utils';

interface Task {
    compile: () => Promise<void>;
    judgeCase: (c: NormalizedCase) => (
        (ctx: Context, ctxSubtask: ContextSubTask, runner?: Function) => Promise<JudgeResultBody['case']>
    )
}

const Score = {
    sum: (a: number, b: number) => (a + b),
    max: Math.max,
    min: Math.min,
};

function judgeSubtask(subtask: NormalizedSubtask, sid: string, judgeCase: Task['judgeCase']) {
    return async (ctx: Context) => {
        subtask.type ||= 'min';
        const ctxSubtask = {
            subtask,
            status: 0,
            score: subtask.type === 'min'
                ? subtask.score
                : 0,
        };
        const cases = [];
        for (const cid in subtask.cases) {
            const runner = judgeCase(subtask.cases[cid]);
            cases.push(ctx.queue.add(async () => {
                const res = (ctx.errored
                    || (subtask.type === 'min' && ctxSubtask.score === 0)
                    || (subtask.type === 'max' && ctxSubtask.score === subtask.score)
                    || (subtask.if || []).filter((i) => ctx.failed[i]).length)
                    ? {
                        id: subtask.cases[cid].id,
                        status: STATUS.STATUS_CANCELED,
                        subtaskId: subtask.id,
                        score: 0,
                        time: 0,
                        memory: 0,
                        message: '',
                    } : await runner(ctx, ctxSubtask, runner);
                if (res?.status !== STATUS.STATUS_CANCELED) {
                    ctxSubtask.score = Score[ctxSubtask.subtask.type](ctxSubtask.score, res.score);
                    ctxSubtask.status = Math.max(ctxSubtask.status, res.status);
                    if (ctxSubtask.status > STATUS.STATUS_ACCEPTED) ctx.failed[sid] = true;
                    ctx.total_time += res.time;
                    ctx.total_memory = Math.max(ctx.total_memory, res.memory);
                }
                ctx.next({ ...res ? { case: res } : {}, addProgress: 100 / ctx.config.count });
            }));
        }
        try {
            await Promise.all(cases);
        } catch (e) {
            ctx.errored = true;
            throw e;
        }
        ctx.total_status = Math.max(ctx.total_status, ctxSubtask.status);
        return ctxSubtask.score;
    };
}

export const runFlow = async (ctx: Context, task: Task) => {
    if (!ctx.config.subtasks.length) throw new FormatError('Problem data not found.');
    ctx.next({ status: STATUS.STATUS_COMPILING });
    await task.compile();
    ctx.next({ status: STATUS.STATUS_JUDGING, progress: 0 });
    ctx.total_status = 0;
    ctx.total_score = 0;
    ctx.total_memory = 0;
    ctx.total_time = 0;
    ctx.rerun = getConfig('rerun') || 0;
    ctx.queue = new Queue({ concurrency: getConfig('singleTaskParallelism') });
    ctx.failed = {};
    if (ctx.meta.hackRejudge) {
        const subtask = ctx.config.subtasks.find((i) => i.cases.find((j) => j.input === ctx.meta.hackRejudge));
        const ctxSubtask = {
            subtask,
            status: STATUS.STATUS_ACCEPTED,
            score: subtask.type === 'min' ? subtask.score : 0,
        };
        const runner = task.judgeCase(subtask.cases.find((i) => i.input === ctx.meta.hackRejudge));
        const res = await runner(ctx, ctxSubtask, runner);
        if (res) ctx.next({ case: res });
        const totalScore = Math.sum(ctx.config.subtasks.map((i) => i.score));
        if (ctxSubtask.status !== STATUS.STATUS_ACCEPTED) {
            ctx.end({
                status: STATUS.STATUS_HACKED,
                score: totalScore - subtask.score,
            });
        } else ctx.end({ nop: true });
    } else {
        const tasks = [];
        for (const sid in ctx.config.subtasks) tasks.push(judgeSubtask(ctx.config.subtasks[sid], sid, task.judgeCase)(ctx));
        const scores = await Promise.all(tasks);
        for (const sid in ctx.config.subtasks) {
            let effective = true;
            for (const required of ctx.config.subtasks[sid].if || []) {
                if (ctx.failed[required.toString()]) effective = false;
            }
            if (effective) ctx.total_score += scores[sid];
        }
        ctx.end({
            status: ctx.total_status,
            score: ctx.total_score,
            time: Math.floor(ctx.total_time * 1000000) / 1000000,
            memory: ctx.total_memory,
        });
    }
    ctx.stat.done = new Date();
    if (process.env.DEV) ctx.next({ message: JSON.stringify(ctx.stat) });
};
