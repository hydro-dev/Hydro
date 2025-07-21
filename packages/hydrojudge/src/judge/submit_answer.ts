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
        await using cleanup = {
            clean: async () => { },
            async [Symbol.asyncDispose]() { await this.clean(); },
        };
        if (ctx.config.subType === 'multi') {
            const res = await runQueued(
                `/usr/bin/unzip -p foo.zip ${name}`,
                {
                    stdin: null,
                    copyIn: { 'foo.zip': ctx.code },
                    time: 1000,
                    memory: 128,
                    cacheStdoutAndStderr: true,
                },
            );
            cleanup.clean = async () => await res[Symbol.asyncDispose]();
            if (res.status === STATUS.STATUS_RUNTIME_ERROR && res.code && res.code !== 11) {
                message = { message: 'Unzip failed.' };
                status = STATUS.STATUS_WRONG_ANSWER;
            } else if (res.status === STATUS.STATUS_RUNTIME_ERROR && res.code && res.code === 11) {
                message = { message: 'File not found.' };
                status = STATUS.STATUS_WRONG_ANSWER;
            }
            file = { fileId: res.fileIds['stdout'] };
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
                detail: ctx.config.detail,
                env: { ...ctx.env, HYDRO_TESTCASE: c.id.toString() },
            }));
        }
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
