import { NormalizedCase, STATUS } from '@hydrooj/common';
import { fs } from '@hydrooj/utils';
import checkers from '../checkers';
import { runFlow } from '../flow';
import { runQueued } from '../sandbox';
import { Context } from './interface';

function judgeCase(c: NormalizedCase) {
    return async (ctx: Context) => {
        const chars = /[a-zA-Z0-9_.-]/;
        const name = (ctx.config.filename && /^[a-zA-Z0-9-_#.]+$/.test(ctx.config.filename))
            ? ctx.config.filename.replace('#', c.id.toString())
            : await fs.readFile(c.input, 'utf-8').then((res) => res.trim().split('').filter((i) => chars.test(i)).join(''));
        let file = ctx.code;
        let status = STATUS.STATUS_ACCEPTED;
        let message: any = '';
        let score = 0;
        let clean = async () => { };
        if (ctx.config.subType === 'multi') {
            const { res, cleanup } = await runQueued(
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
            clean = cleanup;
            if (res.status === STATUS.STATUS_RUNTIME_ERROR && res.code) {
                message = { message: 'Unzip failed.' };
                status = STATUS.STATUS_WRONG_ANSWER;
            } else if (!res.fileIds[name]) {
                message = { message: 'File not found.' };
                status = STATUS.STATUS_WRONG_ANSWER;
            }
            file = { fileId: res.fileIds[name] };
        }
        if (status === STATUS.STATUS_ACCEPTED) {
            ({ status, score, message } = await checkers[ctx.config.checker_type]({
                execute: ctx.checker.execute,
                copyIn: ctx.checker.copyIn || {},
                input: { src: c.input },
                output: { src: c.output },
                user_stdout: file,
                user_stderr: { content: '' },
                code: ctx.code,
                score: c.score,
                detail: ctx.config.detail ?? true,
                env: { ...ctx.env, HYDRO_TESTCASE: c.id.toString() },
            }));
        }
        await clean();
        return {
            id: c.id,
            status,
            score,
            time: 0,
            memory: 0,
            message,
        };
    };
}

export const judge = async (ctx: Context) => {
    await runFlow(ctx, {
        compile: async () => {
            ctx.checker = await ctx.compileLocalFile('checker', ctx.config.checker, ctx.config.checker_type);
        },
        judgeCase,
    });
};
