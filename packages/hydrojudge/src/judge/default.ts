import { NormalizedCase, STATUS } from '@hydrooj/common';
import checkers from '../checkers';
import { runFlow } from '../flow';
import { CopyInFile, runQueued } from '../sandbox';
import signals from '../signals';
import { Context, ContextSubTask } from './interface';

function judgeCase(c: NormalizedCase) {
    const mp = {
        i: 0,
        stdin: { src: c.input } as CopyInFile,
        copyIn: {} as Record<string, CopyInFile>,
    };

    return async (ctx: Context, ctxSubtask: ContextSubTask, runner?: Function) => {
        const { address_space_limit, process_limit } = ctx.session.getLang(ctx.lang);
        const maxPasses = Math.min(ctx.config.multi_pass || 0, 10);
        const multiPass = maxPasses > 1 && ['testlib', 'kattis'].includes(ctx.config.checker_type);
        const passNo = mp.i + 1;

        await using res = await runQueued(
            ctx.execute.execute,
            {
                stdin: multiPass ? mp.stdin : { src: c.input },
                copyIn: multiPass ? { ...ctx.execute.copyIn, ...mp.copyIn } : ctx.execute.copyIn,
                filename: ctx.config.filename,
                time: c.time,
                memory: c.memory,
                cacheStdoutAndStderr: true,
                addressSpaceLimit: address_space_limit,
                processLimit: process_limit,
            },
            `judgeCase[${c.id}]${multiPass && mp.i ? `[pass=${mp.i}]` : ''}<${ctx.rid}>`,
        );
        const {
            code, signalled, time, memory, fileIds,
        } = res;
        let { status } = res;
        let message: any = multiPass ? `Pass ${passNo}` : '';
        let score = 0;
        if (status === STATUS.STATUS_ACCEPTED) {
            if (time > c.time) {
                status = STATUS.STATUS_TIME_LIMIT_EXCEEDED;
            } else if (memory > c.memory * 1024) {
                status = STATUS.STATUS_MEMORY_LIMIT_EXCEEDED;
            } else {
                const checkResult = await checkers[ctx.config.checker_type]({
                    execute: ctx.checker.execute,
                    copyIn: ctx.checker.copyIn || {},
                    code: ctx.code,
                    input: { src: c.input },
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
                        ...(multiPass ? { HYDRO_MULTI_PASS: passNo.toString() } : {}),
                    },
                });
                if (multiPass && checkResult.nextPass && mp.i < maxPasses - 1) {
                    mp.stdin = checkResult.nextPass.input;
                    mp.copyIn = {};
                    if (checkResult.nextPass.state) {
                        if (ctx.config.checker_type === 'kattis') {
                            mp.copyIn['feedback_dir/placeholder'] = { content: '' };
                            mp.copyIn['feedback_dir/state.txt'] = checkResult.nextPass.state;
                        } else {
                            mp.copyIn['state.txt'] = checkResult.nextPass.state;
                        }
                    }
                    mp.i++;
                    return await runner!(ctx, ctxSubtask, runner);
                }
                if (multiPass && checkResult.nextPass) {
                    status = STATUS.STATUS_WRONG_ANSWER;
                    score = 0;
                    message = { message: 'Exceeded maximum number of passes ({0}).', params: [maxPasses] };
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
