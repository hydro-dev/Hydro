import { NormalizedCase, STATUS } from '@hydrooj/common';
import checkers from '../checkers';
import { runFlow } from '../flow';
import { runQueued } from '../sandbox';
import signals from '../signals';
import { Context, ContextSubTask } from './interface';

function judgeCase(c: NormalizedCase) {
    return async (ctx: Context, ctxSubtask: ContextSubTask, runner?: Function) => {
        const { address_space_limit, process_limit } = ctx.session.getLang(ctx.lang);

        await using res = await runQueued(
            ctx.execute.execute,
            {
                stdin: ctx.multiPassInput ?? { src: c.input },
                copyIn: ctx.execute.copyIn,
                filename: ctx.config.filename,
                time: c.time,
                memory: c.memory,
                cacheStdoutAndStderr: true,
                addressSpaceLimit: address_space_limit,
                processLimit: process_limit,
            },
            `judgeCase[${c.id}]${ctx.multiPassRun ? `[pass=${ctx.multiPassRun}]` : ''}<${ctx.rid}>`,
        );
        const {
            code, signalled, time, memory, fileIds,
        } = res;
        let { status } = res;
        let message: any = ctx.multiPassRun ? `Pass ${ctx.multiPassRun}` : '';
        let score = 0;
        if (status === STATUS.STATUS_ACCEPTED) {
            if (time > c.time) {
                status = STATUS.STATUS_TIME_LIMIT_EXCEEDED;
            } else if (memory > c.memory * 1024) {
                status = STATUS.STATUS_MEMORY_LIMIT_EXCEEDED;
            } else {
                const checkResult = await checkers[ctx.config.checker_type]({
                    execute: ctx.checker.execute,
                    copyIn: {
                        ...ctx.checker.copyIn,
                        ...(ctx.multiPassState ? { [ctx.config.checker_type === 'testlib' ? 'state.txt' : 'feedback_dir/state.txt']: ctx.multiPassState } : {}),
                    },
                    code: ctx.code,
                    input: ctx.multiPassInput ?? { src: c.input },
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
                        ...(ctx.multiPassRun ? { HYDRO_MULTI_PASS: ctx.multiPassRun.toString() } : {}),
                    },
                });
                if (ctx.multiPassRun && checkResult.nextPass && ctx.multiPassRun < ctx.config.multi_pass - 1) {
                    ctx.multiPassInput = checkResult.nextPass.input;
                    ctx.multiPassState = checkResult.nextPass.state ?? undefined;
                    ctx.multiPassRun++;
                    return await runner!(ctx, ctxSubtask, runner);
                }
                if (ctx.multiPassRun === ctx.config.multi_pass && checkResult.nextPass) {
                    status = STATUS.STATUS_WRONG_ANSWER;
                    score = 0;
                    message = { message: 'Exceeded maximum number of passes ({0}).', params: [ctx.config.multi_pass] };
                } else {
                    ({ status, score, message } = checkResult);
                }
            }
        } else if (status === STATUS.STATUS_RUNTIME_ERROR && code && ctx.config.detail === 'full') {
            if (code < 32 && signalled) message = signals[code];
            else message = { message: 'Your program returned {0}.', params: [code] };
        }
        if (runner && ctx.rerun && c.time <= 5000 && status === STATUS.STATUS_TIME_LIMIT_EXCEEDED) {
            ctx.rerun--;
            return await runner(ctx, ctxSubtask);
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
