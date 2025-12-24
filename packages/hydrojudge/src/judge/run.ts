import { NormalizedCase, STATUS } from '@hydrooj/common';
import { parseMemoryMB, parseTimeMS } from '@hydrooj/utils';
import { runFlow } from '../flow';
import { runQueued } from '../sandbox';
import signals from '../signals';
import { Context } from './interface';

const judgeCase = (c: NormalizedCase) => async (ctx: Context) => {
    const { address_space_limit, process_limit } = ctx.session.getLang(ctx.lang);
    const res = await runQueued(
        ctx.execute.execute,
        {
            stdin: { content: c.input },
            copyIn: ctx.execute.copyIn,
            // Allow 2x limits for better debugging
            time: parseTimeMS(ctx.config.time || '1s') * 2,
            memory: parseMemoryMB(ctx.config.memory || '256m'),
            filename: ctx.config.filename,
            addressSpaceLimit: address_space_limit,
            processLimit: process_limit,
        },
        `pretest[${c.id}]<${ctx.rid}>`,
        1,
    );
    const {
        code, signalled, time, memory,
    } = res;
    let { status } = res;
    const message: string[] = [];
    if (time > parseTimeMS(ctx.config.time || '1s')) {
        status = STATUS.STATUS_TIME_LIMIT_EXCEEDED;
    } else if (memory > parseMemoryMB(ctx.config.memory || '256m') * 1024) {
        status = STATUS.STATUS_MEMORY_LIMIT_EXCEEDED;
    } else if (code) {
        status = STATUS.STATUS_RUNTIME_ERROR;
        if (code < 32 && signalled) message.push(`ExitCode: ${code} (${signals[code]})`);
        else message.push(`ExitCode: ${code}`);
    }
    message.push(res.stdout, res.stderr);
    if (!ctx.analysis && [STATUS.STATUS_WRONG_ANSWER, STATUS.STATUS_RUNTIME_ERROR].includes(status)) {
        ctx.analysis = true;
        await ctx.runAnalysis(ctx.execute, { content: c.input });
    }
    return {
        id: c.id,
        subtaskId: 1,
        status,
        score: 1,
        time,
        memory,
        message: message.join('\n').substring(0, 102400),
    };
};

export const judge = async (ctx: Context) => {
    ctx.config.subtasks = [{
        id: 1,
        type: 'sum',
        score: 100,
        time: ctx.config.time,
        memory: ctx.config.memory,
        if: [],
        cases: ctx.input.map((i, idx) => ({
            id: idx + 1,
            time: ctx.config.time,
            memory: ctx.config.memory,
            input: i,
            output: '',
            score: 1,
        })),
    }];
    await runFlow(ctx, {
        compile: async () => {
            ctx.execute = await ctx.compile(ctx.lang, ctx.code);
        },
        judgeCase,
    });
};
