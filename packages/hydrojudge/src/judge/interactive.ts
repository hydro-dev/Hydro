import { basename } from 'path';
import { STATUS } from '@hydrooj/utils/lib/status';
import compile, { compileInteractor } from '../compile';
import { runFlow } from '../flow';
import { Execute } from '../interface';
import { runPiped } from '../sandbox';
import signals from '../signals';
import { parse } from '../testlib';
import { NormalizedCase } from '../utils';
import { Context, ContextSubTask } from './interface';

function judgeCase(c: NormalizedCase) {
    return async (ctx: Context, ctxSubtask: ContextSubTask) => {
        ctx.executeInteractor.copyIn.in = c.input ? { src: c.input } : { content: '' };
        ctx.executeInteractor.copyIn.out = c.output ? { src: c.output } : { content: '' };
        const [{
            code, signalled, time, memory,
        }, resInteractor] = await runPiped(
            {
                execute: ctx.executeUser.execute,
                copyIn: ctx.executeUser.copyIn,
                time: c.time,
                memory: c.memory,
            },
            {
                execute: `${ctx.executeInteractor.execute} /w/in /w/tout /w/out`,
                copyIn: ctx.executeInteractor.copyIn,
                time: c.time * 2,
                memory: c.memory * 2,
                copyOut: ['/w/tout?'],
                env: { ...ctx.env, HYDRO_TESTCASE: c.id.toString() },
            },
        );
        // TODO handle tout (maybe pass to checker?)
        let status: number;
        let score = 0;
        let message: any = '';
        if (time > c.time) {
            status = STATUS.STATUS_TIME_LIMIT_EXCEEDED;
        } else if (memory > c.memory * 1024) {
            status = STATUS.STATUS_MEMORY_LIMIT_EXCEEDED;
        } else if ((code && code !== 13/* Broken Pipe */) || (code === 13 && !resInteractor.code)) {
            status = STATUS.STATUS_RUNTIME_ERROR;
            if (code < 32 && signalled) message = signals[code];
            else message = { message: 'Your program returned {0}.', params: [code] };
        } else {
            const result = parse(resInteractor.stderr, c.score);
            status = result.status;
            score = result.score;
            message = result.message;
            if (resInteractor.code && !(resInteractor.stderr || '').trim().length) message += ` (Interactor exited with code ${resInteractor.code})`;
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
        const markCleanup = (i: Execute) => {
            ctx.clean.push(i.clean);
            return i;
        };
        const userExtraFiles = Object.fromEntries(
            (ctx.config.user_extra_files || []).map((i) => [basename(i), { src: i }]),
        );
        const interactorFiles = { user_code: ctx.code };
        for (const file of ctx.config.judge_extra_files) {
            interactorFiles[basename(file)] = { src: file };
        }
        [ctx.executeUser, ctx.executeInteractor] = await Promise.all([
            compile(ctx.session.getLang(ctx.lang), ctx.code, userExtraFiles, ctx.next).then(markCleanup),
            compileInteractor(ctx.session.getLang, ctx.config.interactor, interactorFiles).then(markCleanup),
        ]);
    },
    judgeCase,
});
