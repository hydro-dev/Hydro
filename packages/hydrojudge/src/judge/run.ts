import fs from 'fs-extra';
import path from 'path';
import { argv } from 'yargs';
import * as STATUS from '../status';
import { run } from '../sandbox';
import compile from '../compile';
import signals from '../signals';

export const judge = async (ctx) => {
    ctx.stat.judge = new Date();
    ctx.next({ status: STATUS.STATUS_COMPILING });
    ctx.execute = await compile(ctx.lang, ctx.code, 'code', {}, ctx.next);
    ctx.clean.push(ctx.execute.clean);
    ctx.next({ status: STATUS.STATUS_JUDGING, progress: 0 });
    const copyIn = { ...ctx.execute.copyIn };
    const stdin = path.resolve(ctx.tmpdir, 'stdin');
    const stdout = path.resolve(ctx.tmpdir, 'stdout');
    const stderr = path.resolve(ctx.tmpdir, 'stderr');
    fs.writeFileSync(stdin, ctx.config.input || '');
    const res = await run(
        ctx.execute.execute.replace(/\$\{name\}/g, 'code'),
        {
            stdin,
            stdout,
            stderr,
            copyIn,
            time_limit_ms: ctx.config.time,
            memory_limit_mb: ctx.config.memory,
        },
    );
    const { code, time_usage_ms, memory_usage_kb } = res;
    let { status } = res;
    if (!fs.existsSync(stdout)) fs.writeFileSync(stdout, '');
    let message: any = fs.readFileSync(stdout).toString() + fs.readFileSync(stderr).toString();
    if (status === STATUS.STATUS_ACCEPTED) {
        if (time_usage_ms > ctx.config.time) {
            status = STATUS.STATUS_TIME_LIMIT_EXCEEDED;
        } else if (memory_usage_kb > ctx.config.memory * 1024) {
            status = STATUS.STATUS_MEMORY_LIMIT_EXCEEDED;
        }
    } else if (code) {
        status = STATUS.STATUS_RUNTIME_ERROR;
        if (code < 32) message += signals[code];
        else message = { message: 'Your program returned {0}.', params: [code] };
    }
    ctx.next({
        status,
        case: {
            status,
            time_ms: time_usage_ms,
            memory_kb: memory_usage_kb,
            message,
        },
    });
    ctx.stat.done = new Date();
    if (argv.debug) ctx.next({ message: JSON.stringify(ctx.stat) });
    ctx.end({
        status,
        score: status === STATUS.STATUS_ACCEPTED ? 100 : 0,
        time_ms: Math.floor(time_usage_ms * 1000000) / 1000000,
        memory_kb: memory_usage_kb,
    });
};
