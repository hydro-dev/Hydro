import { STATUS } from '@hydrooj/utils/lib/status';
import { runQueued } from '../sandbox';
import signals from '../signals';
import { JudgeTask } from '../task';
import { parseMemoryMB, parseTimeMS } from '../utils';

export const judge = async (ctx: JudgeTask) => {
    ctx.stat.judge = new Date();
    ctx.next({ status: STATUS.STATUS_COMPILING });
    const execute = await ctx.compile(ctx.lang, ctx.code);
    ctx.next({ status: STATUS.STATUS_JUDGING, progress: 0 });
    const { address_space_limit, process_limit } = ctx.session.getLang(ctx.lang);
    const res = await runQueued(
        execute.execute,
        {
            stdin: { content: ctx.input },
            copyIn: execute.copyIn,
            // Allow 2x limits for better debugging
            time: parseTimeMS(ctx.config.time || '1s') * 2,
            memory: parseMemoryMB(ctx.config.memory || '128m'),
            filename: ctx.config.filename,
            addressSpaceLimit: address_space_limit,
            processLimit: process_limit,
        },
        1,
    );
    const {
        code, signalled, time, memory,
    } = res;
    let { status } = res;
    const message: string[] = [];
    if (time > parseTimeMS(ctx.config.time || '1s')) {
        status = STATUS.STATUS_TIME_LIMIT_EXCEEDED;
    } else if (memory > parseMemoryMB(ctx.config.memory || '128m') * 1024) {
        status = STATUS.STATUS_MEMORY_LIMIT_EXCEEDED;
    } else if (code) {
        status = STATUS.STATUS_RUNTIME_ERROR;
        if (code < 32 && signalled) message.push(`ExitCode: ${code} (${signals[code]})`);
        else message.push(`ExitCode: ${code}`);
    }
    message.push(res.stdout, res.stderr);
    ctx.next({
        status,
        time: Math.floor(time * 1000000) / 1000000,
        memory,
        score: status === STATUS.STATUS_ACCEPTED ? 100 : 0,
        case: {
            subtaskId: 0,
            status,
            score: 100,
            time,
            memory,
            message: message.join('\n').substring(0, 102400),
        },
    });
    if ([STATUS.STATUS_WRONG_ANSWER, STATUS.STATUS_RUNTIME_ERROR].includes(status)) {
        await ctx.runAnalysis(execute, { content: ctx.input });
    }
    ctx.stat.done = new Date();
    if (process.env.DEV) ctx.next({ message: JSON.stringify(ctx.stat) });
    ctx.end({
        status,
        time: Math.floor(time * 1000000) / 1000000,
        memory,
        score: status === STATUS.STATUS_ACCEPTED ? 100 : 0,
    });
};
