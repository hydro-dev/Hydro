import { NormalizedCase, STATUS } from '@hydrooj/common';
import checkers from '../checkers';
import { runFlow } from '../flow';
import { runQueued } from '../sandbox';
import signals from '../signals';
import { Context, ContextSubTask, MultiPassContext } from './interface';

function judgeCase(c: NormalizedCase) {
    const mp: MultiPassContext = { i: 0 };
    return async (ctx: Context, ctxSubtask: ContextSubTask, runner?: Function) => {
        const { address_space_limit, process_limit } = ctx.session.getLang(ctx.lang);
        if (ctx.config.multi_pass && !mp.i) mp.i = 1;

        await using res = await runQueued(
            ctx.execute.execute,
            {
                stdin: mp.input ?? { src: c.input },
                copyIn: { ...ctx.execute.copyIn, ...mp.state },
                filename: ctx.config.filename,
                time: c.time,
                memory: c.memory,
                cacheStdoutAndStderr: true,
                addressSpaceLimit: address_space_limit,
                processLimit: process_limit,
            },
            `judgeCase[${c.id}]${mp.i ? `{pass=${mp.i}}` : ''}<${ctx.rid}>`,
        );
        const {
            code, signalled, time, memory, fileIds,
        } = res;
        let { status } = res;
        let message: any = '';
        let score = 0;
        let nextPass: any;
        if (status === STATUS.STATUS_ACCEPTED) {
            if (time > c.time) {
                status = STATUS.STATUS_TIME_LIMIT_EXCEEDED;
            } else if (memory > c.memory * 1024) {
                status = STATUS.STATUS_MEMORY_LIMIT_EXCEEDED;
            } else {
                ({
                    status, score, message, nextPass,
                } = await checkers[ctx.config.checker_type]({
                    execute: ctx.checker.execute,
                    copyIn: {
                        ...ctx.checker.copyIn,
                        ...mp.state ?? {},
                    },
                    code: ctx.code,
                    input: mp.input ?? { src: c.input },
                    output: { src: c.output },
                    user_stdout: fileIds.stdout ? { fileId: fileIds.stdout } : { content: '' },
                    user_stderr: fileIds.stderr ? { fileId: fileIds.stderr } : { content: '' },
                    score: c.score,
                    detail: ctx.config.detail,
                    env: {
                        ...ctx.env,
                        HYDRO_TESTCASE: c.id.toString(),
                        HYDRO_TIME_USAGE: time.toString(),
                        HYDRO_MEMORY_USAGE: Math.floor(memory / 1024).toString(),
                        ...(mp.i ? { HYDRO_MULTI_PASS: mp.i.toString() } : {}),
                    },
                }));
                if (mp.i && typeof message === 'string') message = `${message} [Pass ${mp.i}]`;
            }
        } else if (status === STATUS.STATUS_RUNTIME_ERROR && code && ctx.config.detail === 'full') {
            if (code < 32 && signalled) message = signals[code];
            else message = { message: 'Your program returned {0}.', params: [`${code}${mp.i ? ` [Pass ${mp.i}]` : ''}`] };
            if (mp.i && typeof message === 'string') message = `${message} [Pass ${mp.i}]`;
        }
        if (nextPass) {
            if (mp.i < ctx.config.multi_pass) {
                mp.input = nextPass.input;
                mp.state = nextPass.state ?? undefined;
                mp.i++;
                return await runner(ctx, ctxSubtask, runner);
            }
            status = STATUS.STATUS_SYSTEM_ERROR;
            score = 0;
            message = { message: 'Exceeded maximum number of passes ({0}).', params: [ctx.config.multi_pass] };
        }
        if (runner && ctx.rerun && c.time <= 5000 && status === STATUS.STATUS_TIME_LIMIT_EXCEEDED) {
            ctx.rerun--;
            return await runner(ctx, ctxSubtask, runner);
        }
        if (!ctx.request.rejudged && !ctx.analysis && [STATUS.STATUS_WRONG_ANSWER, STATUS.STATUS_RUNTIME_ERROR].includes(status)) {
            ctx.analysis = true;
            await ctx.runAnalysis(ctx.execute, { src: c.input });
        }
        return {
            id: c.id,
            subtaskId: ctxSubtask.subtask.id,
            status,
            score,
            time,
            memory,
            message,
        };
    };
}

export const judge = async (ctx: Context) => await runFlow(ctx, {
    compile: async () => {
        [ctx.execute, ctx.checker] = await Promise.all([
            ctx.compile(ctx.lang, ctx.code),
            ctx.compileLocalFile('checker', ctx.config.checker, ctx.config.checker_type),
        ]);
    },
    judgeCase,
});
