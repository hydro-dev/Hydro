import { readFile } from 'fs-extra';
import { STATUS } from '@hydrooj/utils/lib/status';
import { check, compileChecker } from '../check';
import { runFlow } from '../flow';
import { del, run } from '../sandbox';
import { NormalizedCase, parseFilename } from '../utils';
import { Context, ContextSubTask } from './interface';

const Score = {
    sum: (a: number, b: number) => (a + b),
    max: Math.max,
    min: Math.min,
};

function judgeCase(c: NormalizedCase, sid: string) {
    return async (ctx: Context, ctxSubtask: ContextSubTask) => {
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
                id: c.id,
                status,
                score: 0,
                time: 0,
                memory: 0,
                message,
            },
            addProgress: 100 / ctx.config.count,
        });
    };
}

export const judge = async (ctx: Context) => {
    await runFlow(ctx, {
        compile: async () => {
            ctx.checker = await (() => {
                const copyIn = { user_code: ctx.code };
                for (const file of ctx.config.judge_extra_files) {
                    copyIn[parseFilename(file)] = { src: file };
                }
                return compileChecker(
                    ctx.session.getLang,
                    ctx.config.checker_type,
                    ctx.config.checker,
                    copyIn,
                );
            })();
            ctx.clean.push(ctx.checker.clean);
        },
        judgeCase,
    });
};
