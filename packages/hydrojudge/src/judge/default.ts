/* eslint-disable no-await-in-loop */
import { NormalizedCase, STATUS } from '@hydrooj/common';
import checkers, { PassInfo } from '../checkers';
import { runFlow } from '../flow';
import { runQueued } from '../sandbox';
import signals from '../signals';
import { Context, ContextSubTask } from './interface';

const judgeCase = (c: NormalizedCase) => async (ctx: Context, ctxSubtask: ContextSubTask) => {
    const { address_space_limit, process_limit } = ctx.session.getLang(ctx.lang);
    const maxPasses = ctx.config.multi_pass || 0;
    let pass = ctx.config.multi_pass ? 1 : 0;
    let state: PassInfo = { input: { src: c.input }, state: {}, dispose: () => Promise.resolve() };
    while (true) {
        await using res = await runQueued(
            ctx.execute.execute,
            {
                stdin: state.input,
                copyIn: { ...ctx.execute.copyIn, ...state.state },
                filename: ctx.config.filename,
                time: c.time,
                memory: c.memory,
                cacheStdoutAndStderr: true,
                addressSpaceLimit: address_space_limit,
                processLimit: process_limit,
            },
            `judgeCase[${c.id}${pass ? `#${pass}` : ''}]<${ctx.rid}>`,
        );
        const {
            code, signalled, time, memory, fileIds,
        } = res;
        let { status } = res;
        let message: any = '';
        let score = 0;
        let nextPass;
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
                        ...state.state,
                    },
                    code: ctx.code,
                    input: state.input,
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
                        ...(pass ? { HYDRO_MULTI_PASS: pass.toString() } : {}),
                    },
                }));
            }
        } else if (status === STATUS.STATUS_RUNTIME_ERROR && code && ctx.config.detail === 'full') {
            if (code < 32 && signalled) message = signals[code];
            else message = { message: 'Your program returned {0}.', params: [`${code}${pass ? ` [Pass ${pass}]` : ''}`] };
        }
        if (pass && typeof message === 'string' && message) message += ` [Pass ${pass}]`;
        if (nextPass) {
            if (pass < maxPasses) {
                pass++;
                state.dispose();
                state = nextPass;
                continue;
            }
            nextPass.dispose();
            status = STATUS.STATUS_SYSTEM_ERROR;
            score = 0;
            message = { message: 'Exceeded maximum number of passes ({0}).', params: [ctx.config.multi_pass] };
        }
        if (ctx.rerun && c.time <= 5000 && status === STATUS.STATUS_TIME_LIMIT_EXCEEDED) {
            ctx.rerun--;
            continue;
        }
        if (!ctx.request.rejudged && !ctx.analysis && !pass && [STATUS.STATUS_WRONG_ANSWER, STATUS.STATUS_RUNTIME_ERROR].includes(status)) {
            ctx.analysis = true;
            await ctx.runAnalysis(ctx.execute, state.input);
        }
        state.dispose();
        return {
            id: c.id,
            subtaskId: ctxSubtask.subtask.id,
            status,
            score,
            time,
            memory,
            message,
        };
    }
};

export const judge = async (ctx: Context) => await runFlow(ctx, {
    compile: async () => {
        [ctx.execute, ctx.checker] = await Promise.all([
            ctx.compile(ctx.lang, ctx.code),
            ctx.compileLocalFile('checker', ctx.config.checker, ctx.config.checker_type),
        ]);
    },
    judgeCase,
});
