import { basename } from 'path';
import { STATUS } from '@hydrooj/utils/lib/status';
import checkers from '../checkers';
import compile, { compileChecker } from '../compile';
import { runFlow } from '../flow';
import { Execute } from '../interface';
import { Logger } from '../log';
import { CmdFile, del, run } from '../sandbox';
import signals from '../signals';
import { NormalizedCase } from '../utils';
import { Context, ContextSubTask } from './interface';

const logger = new Logger('judge/default');

function judgeCase(c: NormalizedCase) {
    return async (ctx: Context, ctxSubtask: ContextSubTask, runner?: Function) => {
        const { filename } = ctx.config;
        const copyIn = { ...ctx.execute.copyIn };
        if (filename) copyIn[`${filename}.in`] = c.input ? { src: c.input } : { content: '' };
        const copyOutCached = filename ? [`${filename}.out?`] : [];
        const stdin = filename ? null : { src: c.input };
        const res = await run(
            ctx.execute.execute,
            {
                stdin,
                copyIn,
                copyOutCached,
                time: c.time * ctx.execute.time,
                memory: c.memory,
                cacheStdoutAndStderr: true,
            },
        );
        const { code, time, memory } = res;
        let { status } = res;
        let stdout: CmdFile = { fileId: res.fileIds[filename ? `${filename}.out` : 'stdout'] };
        const stderr = { fileId: res.fileIds['stderr'] };
        if (!stdout.fileId) stdout = { content: '' };
        let message: any = '';
        let score = 0;
        if (status === STATUS.STATUS_ACCEPTED) {
            if (time > c.time * ctx.execute.time) {
                status = STATUS.STATUS_TIME_LIMIT_EXCEEDED;
            } else if (memory > c.memory * 1024) {
                status = STATUS.STATUS_MEMORY_LIMIT_EXCEEDED;
            } else {
                ({ status, score, message } = await checkers[ctx.config.checker_type]({
                    execute: ctx.checker.execute,
                    copyIn: ctx.checker.copyIn || {},
                    input: { src: c.input },
                    output: { src: c.output },
                    user_stdout: stdout,
                    user_stderr: stderr,
                    score: c.score,
                    detail: ctx.config.detail ?? true,
                    env: { ...ctx.env, HYDRO_TESTCASE: c.id.toString() },
                }));
            }
        } else if (status === STATUS.STATUS_RUNTIME_ERROR && code) {
            if (code < 32) message = signals[code];
            else message = { message: 'Your program returned {0}.', params: [code] };
        }
        await Promise.all(
            Object.values(res.fileIds).map((id) => del(id)),
        ).catch(() => { /* Ignore file doesn't exist */ });
        if (runner && ctx.rerun && c.time <= 5000 && status === STATUS.STATUS_TIME_LIMIT_EXCEEDED) {
            ctx.rerun--;
            return await runner(ctx, ctxSubtask);
        }
        if (!ctx.request.rejudged && [STATUS.STATUS_WRONG_ANSWER, STATUS.STATUS_RUNTIME_ERROR].includes(status)) {
            const langConfig = ctx.session.getLang(ctx.lang);
            if (langConfig.analysis && !ctx.analysis) {
                ctx.analysis = true;
                try {
                    const r = await run(langConfig.analysis, {
                        copyIn: {
                            ...copyIn,
                            input: stdin || { content: '' },
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
            ).then(markCleanup),
        ]);
    },
    judgeCase,
});
