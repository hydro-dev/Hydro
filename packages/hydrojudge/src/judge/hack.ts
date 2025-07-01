import { STATUS } from '@hydrooj/common';
import { fs, parseMemoryMB, parseTimeMS } from '@hydrooj/utils';
import checkers from '../checkers';
import { runQueued } from '../sandbox';
import signals from '../signals';
import { Context } from './interface';

export async function judge(ctx: Context) {
    ctx.next({ status: STATUS.STATUS_COMPILING, progress: 0 });
    const [execute, checker, validator, input] = await Promise.all([
        ctx.compile(ctx.lang, ctx.code),
        ctx.compileLocalFile('checker', ctx.config.checker, ctx.config.checker_type),
        ctx.compileLocalFile('validator', ctx.config.validator),
        (async () => {
            const f = await ctx.session.fetchFile(null, { [ctx.files.hack]: '' });
            ctx.pushClean(() => fs.unlink(f));
            return f;
        })(),
    ]);
    ctx.next({ status: STATUS.STATUS_JUDGING, progress: 0 });
    const validateResult = await runQueued(
        validator.execute,
        {
            stdin: { src: input },
            copyIn: validator.copyIn,
            time: parseTimeMS(ctx.config.time || '1s'),
            memory: parseMemoryMB(ctx.config.memory || '256m'),
        },
        `hack.validator[${ctx.rid}]`,
    );
    if (validateResult.status !== STATUS.STATUS_ACCEPTED) {
        const message = `${validateResult.stdout || ''}\n${validateResult.stderr || ''}`.trim();
        return ctx.end({ status: STATUS.STATUS_FORMAT_ERROR, message });
    }
    const { address_space_limit, process_limit } = ctx.session.getLang(ctx.lang);
    await using res = await runQueued(
        execute.execute,
        {
            stdin: { src: input },
            copyIn: execute.copyIn,
            time: parseTimeMS(ctx.config.time || '1s'),
            memory: parseMemoryMB(ctx.config.memory || '256m'),
            filename: ctx.config.filename,
            cacheStdoutAndStderr: true,
            addressSpaceLimit: address_space_limit,
            processLimit: process_limit,
        },
        `hack[${ctx.rid}]`,
    );
    const {
        code, signalled, time, memory,
    } = res;
    let { status } = res;
    let message: any = '';
    if (status === STATUS.STATUS_ACCEPTED) {
        if (time > ctx.config.time) {
            status = STATUS.STATUS_TIME_LIMIT_EXCEEDED;
        } else if (memory > ctx.config.memory * 1024) {
            status = STATUS.STATUS_MEMORY_LIMIT_EXCEEDED;
        } else {
            ({ status, message } = await checkers[ctx.config.checker_type]({
                execute: checker.execute,
                copyIn: checker.copyIn || {},
                input: { src: input },
                output: { content: '' },
                user_stdout: res.fileIds.stdout ? { fileId: res.fileIds.stdout } : { content: '' },
                user_stderr: { fileId: res.fileIds.stderr },
                code: ctx.code,
                score: 100,
                detail: ctx.config.detail ?? 'full',
                env: { ...ctx.env, HYDRO_TESTCASE: '0' },
            }));
        }
    } else if (status === STATUS.STATUS_RUNTIME_ERROR && code) {
        if (code < 32 && signalled) message = signals[code];
        else message = { message: 'Your program returned {0}.', params: [code] };
    }
    if (message) ctx.next({ message });

    return ctx.end({
        status: status === STATUS.STATUS_ACCEPTED ? STATUS.STATUS_HACK_UNSUCCESSFUL : STATUS.STATUS_HACK_SUCCESSFUL,
        score: 0,
        time,
        memory,
    });
}
