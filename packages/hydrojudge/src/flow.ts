import Queue from 'p-queue';
import {
    JudgeResultBody, NormalizedCase, NormalizedSubtask, STATUS, type SubtaskResult, type SubtaskType,
} from '@hydrooj/common';
import { getConfig } from './config';
import { FormatError } from './error';
import { Context, ContextSubTask } from './judge/interface';

interface Task {
    compile: () => Promise<void>;
    judgeCase: (c: NormalizedCase) => (
        (ctx: Context, ctxSubtask: ContextSubTask, runner?: Function) => Promise<JudgeResultBody['case']>
    );
}

const Score = {
    sum: (a: number, b: number) => (a + b),
    max: Math.max,
    min: Math.min,
};

function judgeSubtask(subtask: NormalizedSubtask, sid: string, judgeCase: Task['judgeCase'], skip = false) {
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
                const res = (skip
                    || ctx.errored
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
                    } : await (async () => {
                        using span = ctx.startChildSpan('judge.case', { id: subtask.cases[cid].id, subtaskId: subtask.id });
                        const r = await runner(ctx, ctxSubtask, runner);
                        span.setAttributes({ status: r?.status, time: r?.time, memory: r?.memory });
                        return r;
                    })();
                if (res?.status !== STATUS.STATUS_CANCELED) {
                    ctxSubtask.score = Score[ctxSubtask.subtask.type](ctxSubtask.score, res.score);
                    ctxSubtask.status = Math.max(ctxSubtask.status, res.status);
                    if (ctxSubtask.status > STATUS.STATUS_ACCEPTED) ctx.failed[sid] = true;
                    ctx.total_time += res.time;
                    ctx.total_memory = Math.max(ctx.total_memory, res.memory);
                }
                if (ctx.config.detail !== 'none') {
                    ctx.next({ ...res ? { case: res } : {}, addProgress: 100 / ctx.config.count });
                }
            }));
        }
        try {
            await Promise.all(cases);
        } catch (e) {
            ctx.errored = true;
            throw e;
        }
        ctx.total_status = Math.max(ctx.total_status, ctxSubtask.status);
        return {
            type: ctxSubtask.subtask.type as SubtaskType,
            score: ctxSubtask.score,
            status: ctxSubtask.status,
        };
    };
}

async function judgeScoreDependentSubtasks(ctx: Context, task: Task) {
    const subtasks: Record<string, NormalizedSubtask> = {};
    for (const [key, value] of Object.entries(ctx.config.subtasks)) {
        subtasks[value.id?.toString() || key] = value;
    }
    const pending = new Set(Object.keys(subtasks));
    const infos: Record<string, SubtaskResult> = {};
    while (pending.size) {
        const ready = [...pending].filter((sid) => {
            const subtask = subtasks[sid];
            return [...(subtask.if || []), ...(subtask.if_score || [])]
                .every((id) => !subtasks[id] || !pending.has(id.toString()));
        });
        if (!ready.length) throw new FormatError('Circular dependency between subtasks.');
        for (const sid of ready) pending.delete(sid);
        // eslint-disable-next-line no-await-in-loop
        await Promise.all(ready.map(async (sid) => {
            const subtask = subtasks[sid];
            const accepted = (subtask.if || []).every((id) => (
                !subtasks[id] || (infos[id] && infos[id].status <= STATUS.STATUS_ACCEPTED)
            ));
            const scored = (subtask.if_score || []).every((id) => infos[id]?.score > 0);
            if (!accepted || !scored) {
                ctx.failed[sid] = true;
                await judgeSubtask(subtask, sid, task.judgeCase, true)(ctx);
                return;
            }
            infos[sid] = await judgeSubtask(subtask, sid, task.judgeCase)(ctx);
        }));
    }
    for (const info of Object.values(infos)) ctx.total_score += info.score;
    return infos;
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
        const subtask = ctx.config.subtasks.find((i) => i.cases.find((j) => j.input.endsWith(ctx.meta.hackRejudge)));
        const ctxSubtask = {
            subtask,
            status: STATUS.STATUS_ACCEPTED,
            score: subtask.type === 'min' ? subtask.score : 0,
        };
        const runner = task.judgeCase(subtask.cases.find((i) => i.input.endsWith(ctx.meta.hackRejudge)));
        const res = await runner(ctx, ctxSubtask, runner);
        if (res) ctx.next({ case: res });
        if (res?.status !== STATUS.STATUS_ACCEPTED) {
            const totalScore = Math.sum(ctx.config.subtasks.map((i) => i.score));
            ctx.end({
                status: STATUS.STATUS_HACKED,
                score: totalScore - subtask.score,
            });
        } else {
            ctx.next({ status: STATUS.STATUS_ACCEPTED });
            ctx.end({ nop: true });
        }
    } else {
        const hasScoreDependencies = ctx.config.subtasks.some((i) => i.if_score?.length);
        const infos = hasScoreDependencies ? await judgeScoreDependentSubtasks(ctx, task) : {};
        if (!hasScoreDependencies) {
            await Promise.all(Object.entries(ctx.config.subtasks).map(async ([key, value]) => {
                const sid = value.id?.toString() || key;
                infos[sid] = await judgeSubtask(value, sid, task.judgeCase)(ctx);
            }));
            for (const [key, value] of Object.entries(ctx.config.subtasks)) {
                let effective = true;
                const sid = value.id?.toString() || key;
                for (const required of value.if || []) {
                    if (ctx.failed[required.toString()]) effective = false;
                }
                if (effective) ctx.total_score += infos[sid].score;
                else {
                    ctx.failed[sid] = true;
                    delete infos[sid];
                }
            }
        }
        ctx.end({
            status: ctx.total_status,
            score: ctx.total_score,
            time: Math.floor(ctx.total_time * 1000000) / 1000000,
            memory: ctx.total_memory,
            subtasks: infos,
        });
    }
};
