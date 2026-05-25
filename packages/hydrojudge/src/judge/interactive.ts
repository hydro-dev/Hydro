import { NormalizedCase, STATUS } from '@hydrooj/common';
import { runFlow } from '../flow';
import { CopyInFile, runPiped } from '../sandbox';
import signals from '../signals';
import { parse } from '../testlib';
import { Context, ContextSubTask } from './interface';

function judgeCase(c: NormalizedCase) {
    return async (ctx: Context, ctxSubtask: ContextSubTask, runner?: Function) => {
        const { address_space_limit, process_limit } = ctx.session.getLang(ctx.lang);

        const [{
            code, signalled, time, memory,
        }, resInteractor] = await runPiped([
            {
                execute: ctx.executeUser.execute,
                copyIn: ctx.executeUser.copyIn,
                time: c.time,
                memory: c.memory,
                addressSpaceLimit: address_space_limit,
                processLimit: process_limit,
            },
            {
                execute: `${ctx.executeInteractor.execute} /w/in /w/tout /w/out`,
                copyIn: {
                    in: ctx.multiPassInput ?? (c.input ? { src: c.input } : { content: '' }),
                    out: c.output ? { src: c.output } : { content: '' },
                    ...ctx.executeInteractor.copyIn,
                    ...(ctx.multiPassState ? { [ctx.config.interactor === 'testlib' ? 'state.txt' : 'feedback_dir/state.txt']: ctx.multiPassState } : {}),
                },
                time: c.time * 2,
                memory: c.memory * 2,
                copyOut: ['nextpass.in?', 'state.txt?', '/w/tout?'],
                env: {
                    ...ctx.env,
                    HYDRO_TESTCASE: c.id.toString(),
                    ...(ctx.multiPassRun ? { HYDRO_MULTI_PASS: ctx.multiPassRun.toString() } : {}),
                },
            },
        ], [
            { in: { index: 0, fd: 1 }, out: { index: 1, fd: 0 }, name: 'userToInteractor' },
            { in: { index: 1, fd: 1 }, out: { index: 0, fd: 0 }, name: 'interactorToUser' },
        ]);
        // TODO handle tout (maybe pass to checker?)
        let status: number;
        let score = 0;
        let message: any = ctx.multiPassRun ? `Pass ${ctx.multiPassRun}` : '';
        if (time > c.time) {
            status = STATUS.STATUS_TIME_LIMIT_EXCEEDED;
        } else if (memory > c.memory * 1024) {
            status = STATUS.STATUS_MEMORY_LIMIT_EXCEEDED;
        } else if (ctx.config.detail === 'full' && ((code && code !== 13/* Broken Pipe */) || (code === 13 && !resInteractor.code))) {
            status = STATUS.STATUS_RUNTIME_ERROR;
            if (code < 32 && signalled) message = signals[code];
            else message = { message: 'Your program returned {0}.', params: [code] };
        } else {
            const result = parse(resInteractor.stderr, c.score, ctx.config.detail);
            status = result.status;
            score = result.score;
            message = result.message;
            if (resInteractor.code && !(resInteractor.stderr || '').trim().length) message += ` (Interactor exited with code ${resInteractor.code})`;
            if (status === STATUS.STATUS_ACCEPTED) {
                const files = resInteractor.files || {};
                if (files['nextpass.in'] !== undefined) {
                    if (ctx.multiPassRun && ctx.multiPassRun < ctx.config.multi_pass - 1) {
                        ctx.multiPassInput = { fileId: files['nextpass.in'] };
                        ctx.multiPassState = files['state.txt'] !== undefined
                            ? { fileId: files['state.txt'] }
                            : undefined;
                        ctx.multiPassRun++;
                        return await runner!(ctx, ctxSubtask, runner);
                    }
                    status = STATUS.STATUS_WRONG_ANSWER;
                    score = 0;
                    message = { message: 'Exceeded maximum number of passes ({0}).', params: [ctx.multiPassRun] };
                }
            }
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
        [ctx.executeUser, ctx.executeInteractor] = await Promise.all([
            ctx.compile(ctx.lang, ctx.code),
            ctx.compileLocalFile('interactor', ctx.config.interactor),
        ]);
    },
    judgeCase,
});
