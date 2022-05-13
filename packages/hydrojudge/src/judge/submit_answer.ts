import { readFile } from 'fs-extra';
import Queue from 'p-queue';
import { STATUS } from '@hydrooj/utils/lib/status';
import { check, compileChecker } from '../check';
import { getConfig } from '../config';
import { FormatError } from '../error';
import { del, run } from '../sandbox';
import { NormalizedCase, NormalizedSubtask, parseFilename } from '../utils';
import { Context, ContextSubTask } from './interface';

const Score = {
    sum: (a: number, b: number) => (a + b),
    max: Math.max,
    min: Math.min,
};

function judgeCase(c: NormalizedCase, sid: string) {
    return async (ctx: Context, ctxSubtask: ContextSubTask) => {
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
        const chars = /[a-zA-Z0-9_.-]/;
        const name = (ctx.config.filename && /^[a-zA-Z0-9-_#.]+$/.test(ctx.config.filename))
            ? ctx.config.filename.replace('#', c.id.toString())
            : await readFile(c.input, 'utf-8').then((res) => res.trim().split('').filter((i) => chars.test(i)).join(''));
        let file = ctx.code;
        let status = STATUS.STATUS_ACCEPTED;
        let message: any = '';
        let score = 0;
        const fileIds = [];
        if (ctx.config.subType === 'multi') {
            const res = await run(
                '/usr/bin/unzip foo.zip',
                {
                    stdin: null,
                    copyIn: { 'foo.zip': ctx.code },
                    copyOutCached: [`${name}?`],
                    time: 1000,
                    memory: 128,
                    cacheStdoutAndStderr: true,
                },
            );
            if (res.status === STATUS.STATUS_RUNTIME_ERROR && res.code) {
                message = { message: 'Unzip failed.' };
                status = STATUS.STATUS_WRONG_ANSWER;
            } else if (!res.fileIds[name]) {
                message = { message: 'File not found.' };
                status = STATUS.STATUS_WRONG_ANSWER;
            }
            file = { fileId: res.fileIds[name] };
            fileIds.push(...Object.values(res.fileIds));
        }
        if (status === STATUS.STATUS_ACCEPTED) {
            [status, score, message] = await check({
                execute: ctx.checker.execute,
                copyIn: ctx.checker.copyIn || {},
                input: { src: c.input },
                output: { src: c.output },
                user_stdout: file,
                user_stderr: { content: '' },
                checker_type: ctx.config.checker_type,
                score: c.score,
                detail: ctx.config.detail ?? true,
                env: { ...ctx.env, HYDRO_TESTCASE: c.id.toString() },
            });
        }
        await Promise.all(fileIds.map(del)).catch(() => { /* Ignore file doesn't exist */ });
        ctxSubtask.score = Score[ctxSubtask.subtask.type](ctxSubtask.score, score);
        ctxSubtask.status = Math.max(ctxSubtask.status, status);
        if (ctxSubtask.status > STATUS.STATUS_ACCEPTED) ctx.failed[sid] = true;
        ctx.next({
            case: {
                status,
                score: 0,
                time: 0,
                memory: 0,
                message,
            },
            addProgress: 100 / ctx.config.count,
        }, c.id);
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
            cases.push(ctx.queue.add(() => runner(ctx, ctxSubtask)));
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
    ctx.checker = await (() => {
        if (['default', 'strict'].includes(ctx.config.checker_type || 'default')) {
            return { execute: '', copyIn: {}, clean: () => Promise.resolve(null) };
        }
        const copyIn = { user_code: ctx.code };
        for (const file of ctx.config.judge_extra_files) {
            copyIn[parseFilename(file)] = { src: file };
        }
        return compileChecker(
            ctx.getLang,
            ctx.config.checker_type,
            ctx.config.checker,
            copyIn,
        );
    })();
    ctx.clean.push(ctx.checker.clean);
    await startPromise;
    ctx.next({ status: STATUS.STATUS_JUDGING, progress: 0 });
    const tasks = [];
    ctx.total_status = 0;
    ctx.total_score = 0;
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
        time: 0,
        memory: 0,
    });
};
