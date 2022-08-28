import Queue from 'p-queue';
import { STATUS } from '@hydrooj/utils/lib/status';
import { getConfig } from './config';
import { CompileError, FormatError } from './error';
import { Context, ContextSubTask } from './judge/interface';
import { NormalizedCase, NormalizedSubtask } from './utils';

interface Task {
    compile: () => Promise<void>;
    judgeCase: (c: NormalizedCase, sid: string) => (
        (ctx: Context, ctxSubtask: ContextSubTask, runner?: Function) => Promise<any>
    )
}

function judgeSubtask(subtask: NormalizedSubtask, sid: string, judgeCase: Task['judgeCase']) {
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
            const runner = judgeCase(subtask.cases[cid], subtask.id.toString() ?? sid);
            cases.push(ctx.queue.add(async () => {
                if (ctx.errored
                    || (ctxSubtask.subtask.type === 'min' && ctxSubtask.score === 0)
                    || (ctxSubtask.subtask.type === 'max' && ctxSubtask.score === ctxSubtask.subtask.score)
                    || ((ctxSubtask.subtask.if || []).filter((i) => ctx.failed[i]).length)
                ) {
                    ctx.next({
                        case: {
                            id: subtask.cases[cid].id,
                            status: STATUS.STATUS_CANCELED,
                            subtaskId: subtask.id,
                            score: 0,
                            time: 0,
                            memory: 0,
                            message: '',
                        },
                        addProgress: 100 / ctx.config.count,
                    });
                } else await runner(ctx, ctxSubtask, runner);
            }));
        }
        await Promise.all(cases).catch((e) => {
            ctx.errored = true;
            throw e;
        });
        ctx.total_status = Math.max(ctx.total_status, ctxSubtask.status);
        return ctxSubtask.score;
    };
}

export const runFlow = async (ctx: Context, task: Task) => {
    if (!ctx.config.subtasks.length) throw new FormatError('Problem data not found.');
    ctx.next({ status: STATUS.STATUS_COMPILING });
    if (ctx.config.template && 'content' in ctx.code) {
        if (ctx.config.template[ctx.lang]) {
            const tpl = ctx.config.template[ctx.lang];
            ctx.code.content = tpl[0] + ctx.code.content + tpl[1];
        } else throw new CompileError('Language not supported by provided templates');
    }
    await task.compile();
    ctx.next({ status: STATUS.STATUS_JUDGING, progress: 0 });
    const tasks = [];
    ctx.total_status = 0;
    ctx.total_score = 0;
    ctx.total_memory_usage_kb = 0;
    ctx.total_time_usage_ms = 0;
    ctx.rerun = getConfig('rerun') || 0;
    ctx.queue = new Queue({ concurrency: getConfig('singleTaskParallelism') });
    ctx.failed = {};
    for (const sid in ctx.config.subtasks) tasks.push(judgeSubtask(ctx.config.subtasks[sid], sid, task.judgeCase)(ctx));
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
