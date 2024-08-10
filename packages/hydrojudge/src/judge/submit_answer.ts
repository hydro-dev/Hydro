import { readFile } from 'fs/promises';
import { fs } from '@hydrooj/utils';
import { STATUS } from '@hydrooj/utils/lib/status';
import { Position } from 'hydrooj';
import checkers from '../checkers';
import { runFlow } from '../flow';
import { del, get, runQueued } from '../sandbox';
import { fileKeepAround, NormalizedCase } from '../utils';
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
        let scaledScore = 0;
        let error: { stream: string, pos: Position } | undefined;
        const fileIds = [];
        if (ctx.config.subType === 'multi') {
            const res = await runQueued(
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
            if (res.status === STATUS.STATUS_RUNTIME_ERROR && res.code) {
                message = { message: 'Unzip failed.' };
                status = STATUS.STATUS_WRONG_ANSWER;
            } else if (!res.fileIds[name]) {
                message = { message: 'File not found.' };
                status = STATUS.STATUS_WRONG_ANSWER;
            }
            file = { fileId: res.fileIds[name] };
            fileIds.push(...Object.values(res.fileIds));
        }
        if (status === STATUS.STATUS_ACCEPTED) {
            ({
                status, score, scaledScore, message, error,
            } = await checkers[ctx.config.checker_type]({
                execute: ctx.checker.execute,
                copyIn: ctx.checker.copyIn || {},
                input: { src: c.input },
                output: { src: c.output },
                user_stdout: file,
                user_stderr: { content: '' },
                score: c.score,
                detail: ctx.config.detail ?? true,
                env: { ...ctx.env, HYDRO_TESTCASE: c.id.toString() },
            }));
        }

        const [infContent, ansContent] = await Promise.all([
            readFile(c.input),
            readFile(c.output),
        ]);
        const oufContent = fileIds[name] ? await get(fileIds[name]) : Buffer.alloc(0);

        const [inf, ouf, ans] = [['inf', infContent], ['ouf', oufContent], ['ans', ansContent]].map(([streamName, content]: [string, Buffer]) => {
            if (!error || error.stream !== streamName) {
                return fileKeepAround(content, 0);
            }
            const streamFile = fileKeepAround(content, error.pos.byte);
            streamFile.highlightLines = [error.pos.line];
            return streamFile;
        });

        await Promise.allSettled(fileIds.map(del));
        return {
            id: c.id,
            status,
            score,
            scaledScore,
            time: 0,
            memory: 0,
            message,
            streams: {
                inf,
                ouf,
                ans,
            },
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
