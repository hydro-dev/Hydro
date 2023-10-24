import { basename } from 'path';
import { STATUS } from '@hydrooj/utils/lib/status';
import checkers from '../checkers';
import compile, { compileChecker } from '../compile';
import { runFlow } from '../flow';
import { Execute } from '../interface';
import { Logger } from '../log';
import { del, runQueued } from '../sandbox';
import signals from '../signals';
import { NormalizedCase } from '../utils';
import { Context, ContextSubTask } from './interface';

const logger = new Logger('judge/default');

function judgeCase(c: NormalizedCase) {
    return async (ctx: Context, ctxSubtask: ContextSubTask, runner?: Function) => {
        const res = await runQueued(
            ctx.execute.execute,
            {
                stdin: { src: c.input },
                copyIn: ctx.execute.copyIn,
                filename: ctx.config.filename,
                time: c.time,
                memory: c.memory,
                cacheStdoutAndStderr: true,
            },
        );
        const {
            code, signalled, time, memory, fileIds,
        } = res;
        let { status } = res;
        let message: any = '';
        let score = 0;
        if (status === STATUS.STATUS_ACCEPTED) {
            if (time > c.time) {
                status = STATUS.STATUS_TIME_LIMIT_EXCEEDED;
            } else if (memory > c.memory * 1024) {
                status = STATUS.STATUS_MEMORY_LIMIT_EXCEEDED;
            } else {
                ({ status, score, message } = await checkers[ctx.config.checker_type]({
                    execute: ctx.checker.execute,
                    copyIn: ctx.checker.copyIn || {},
                    input: { src: c.input },
                    output: { src: c.output },
                    user_stdout: fileIds.stdout ? { fileId: fileIds.stdout } : { content: '' },
                    user_stderr: fileIds.stderr ? { fileId: fileIds.stderr } : { content: '' },
                    score: c.score,
                    detail: ctx.config.detail ?? true,
                    env: { ...ctx.env, HYDRO_TESTCASE: c.id.toString() },
                }));
            }
        } else if (status === STATUS.STATUS_RUNTIME_ERROR && code) {
            if (code < 32 && signalled) message = signals[code];
            else message = { message: 'Your program returned {0}.', params: [code] };
        }
        await Promise.allSettled(Object.values(res.fileIds).map((id) => del(id)));
        if (runner && ctx.rerun && c.time <= 5000 && status === STATUS.STATUS_TIME_LIMIT_EXCEEDED) {
            ctx.rerun--;
            return await runner(ctx, ctxSubtask);
        }
        if (!ctx.request.rejudged && [STATUS.STATUS_WRONG_ANSWER, STATUS.STATUS_RUNTIME_ERROR].includes(status)) {
            const langConfig = ctx.session.getLang(ctx.lang);
            if (langConfig.analysis && !ctx.analysis) {
                ctx.analysis = true;
                try {
                    const r = await runQueued(langConfig.analysis, {
                        copyIn: {
                            ...ctx.execute.copyIn,
                            input: { src: c.input },
                            [langConfig.code_file || 'foo']: ctx.code,
                            compile: { content: langConfig.compile || '' },
                            execute: { content: langConfig.execute || '' },
                        },
                        time: 5000,
                        memory: 256,
                        env: ctx.env,
                    });
                    const out = r.stdout.toString();
                    if (out.length) ctx.next({ compilerText: out.substring(0, 1024) });
                    if (process.env.DEV) console.log(r);
                } catch (e) {
                    logger.info('Failed to run analysis');
                    logger.error(e);
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
        const markCleanup = (i: Execute) => {
            ctx.clean.push(i.clean);
            return i;
        };
        [ctx.execute, ctx.checker] = await Promise.all([
            compile(
                ctx.session.getLang(ctx.lang), ctx.code,
                Object.fromEntries(
                    (ctx.config.user_extra_files || []).map((i) => [i.split('/').pop(), { src: i }]),
                ),
                ctx.next,
            ).then(markCleanup),
            compileChecker(
                ctx.session.getLang,
                ctx.config.checker_type,
                ctx.config.checker,
                {
                    user_code: ctx.code,
                    ...Object.fromEntries(
                        (ctx.config.judge_extra_files || []).map((i) => [basename(i), { src: i }]),
                    ),
                },
                ctx.next,
            ).then(markCleanup),
        ]);
    },
    judgeCase,
});
