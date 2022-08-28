import { STATUS } from '@hydrooj/utils/lib/status';
import compile from '../compile';
import { runFlow } from '../flow';
import { runPiped } from '../sandbox';
import signals from '../signals';
import { parse } from '../testlib';
import {
    findFileSync, NormalizedCase, parseFilename,
} from '../utils';
import { Context, ContextSubTask } from './interface';

const testlibSrc = findFileSync('@hydrooj/hydrojudge/vendor/testlib/testlib.h');
const Score = {
    sum: (a: number, b: number) => (a + b),
    max: Math.max,
    min: Math.min,
};

function judgeCase(c: NormalizedCase) {
    return async (ctx: Context, ctxSubtask: ContextSubTask) => {
        ctx.executeInteractor.copyIn.in = c.input ? { src: c.input } : { content: '' };
        ctx.executeInteractor.copyIn.out = c.output ? { src: c.output } : { content: '' };
        const [{ code, time_usage_ms, memory_usage_kb }, resInteractor] = await runPiped(
            {
                execute: ctx.executeUser.execute,
                copyIn: ctx.executeUser.copyIn,
                time: c.time * ctx.executeUser.time,
                memory: c.memory,
            },
            {
                execute: `${ctx.executeInteractor.execute} /w/in /w/tout /w/out`,
                copyIn: ctx.executeInteractor.copyIn,
                time: c.time * 2 * ctx.executeInteractor.time,
                memory: c.memory * 2,
                copyOut: ['/w/tout?'],
                env: { ...ctx.env, HYDRO_TESTCASE: c.id.toString() },
            },
        );
        // TODO handle tout (maybe pass to checker?)
        let status: number;
        let score = 0;
        let message: any = '';
        if (time_usage_ms > c.time * ctx.executeUser.time) {
            status = STATUS.STATUS_TIME_LIMIT_EXCEEDED;
        } else if (memory_usage_kb > c.memory * 1024) {
            status = STATUS.STATUS_MEMORY_LIMIT_EXCEEDED;
        } else if ((code && code !== 13/* Broken Pipe */) || (code === 13 && !resInteractor.code)) {
            status = STATUS.STATUS_RUNTIME_ERROR;
            if (code < 32) message = signals[code];
            else message = { message: 'Your program returned {0}.', params: [code] };
        } else {
            const result = parse(resInteractor.stderr, c.score);
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
                id: c.id,
                subtaskId: ctxSubtask.subtask.id,
                status,
                score,
                time: time_usage_ms,
                memory: memory_usage_kb,
                message,
            },
            addProgress: 100 / ctx.config.count,
        });
    };
}

export const judge = async (ctx: Context) => await runFlow(ctx, {
    compile: async () => {
        [ctx.executeUser, ctx.executeInteractor] = await Promise.all([
            (() => {
                const copyIn = {};
                for (const file of ctx.config.user_extra_files) {
                    copyIn[parseFilename(file)] = { src: file };
                }
                return compile(ctx.session.getLang(ctx.lang), ctx.code, copyIn, ctx.next);
            })(),
            (() => {
                const copyIn = {
                    'testlib.h': { src: testlibSrc },
                    user_code: ctx.code,
                };
                for (const file of ctx.config.judge_extra_files) {
                    copyIn[parseFilename(file)] = { src: file };
                }
                return compile(
                    ctx.session.getLang(parseFilename(ctx.config.interactor).split('.')[1].replace('@', '.')),
                    { src: ctx.config.interactor },
                    copyIn,
                );
            })(),
        ]);
        ctx.clean.push(ctx.executeUser.clean, ctx.executeInteractor.clean);
    },
    judgeCase,
});
