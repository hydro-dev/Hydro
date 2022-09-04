/* eslint-disable no-sequences */
import { basename } from 'path';
import { STATUS } from '@hydrooj/utils/lib/status';
import checkers from '../checkers';
import compile, { compileChecker, compileValidator } from '../compile';
import { Execute } from '../interface';
import { CmdFile, del, run } from '../sandbox';
import signals from '../signals';
import { parseMemoryMB, parseTimeMS } from '../utils';
import { Context } from './interface';

export async function judge(ctx: Context) {
    const { config, session } = ctx;
    ctx.next({ status: STATUS.STATUS_COMPILING, progress: 0 });
    const userExtraFiles = Object.fromEntries(
        (config.user_extra_files || []).map((i) => [basename(i), { src: i }]),
    );
    const judgeExtraFiles = Object.fromEntries(
        (config.judge_extra_files || []).map((i) => [basename(i), { src: i }]),
    );
    const markCleanup = (i: Execute) => (ctx.clean.push(i.clean), i);
    const [execute, checker, validator, input] = await Promise.all([
        compile(session.getLang(ctx.lang), ctx.code, userExtraFiles, ctx.next).then(markCleanup),
        compileChecker(session.getLang, config.checker_type, config.checker, judgeExtraFiles).then(markCleanup),
        compileValidator(session.getLang, config.validator, judgeExtraFiles).then(markCleanup),
        ctx.session.fetchFile(ctx.files.hack),
    ]);
    ctx.next({ status: STATUS.STATUS_JUDGING, progress: 0 });
    const validateResult = await run(
        validator.execute,
        {
            stdin: { src: input },
            copyIn: { ...validator.copyIn, ...judgeExtraFiles },
            time: parseTimeMS(ctx.config.time || '1s') * execute.time,
            memory: parseMemoryMB(ctx.config.memory || '256m'),
        },
    );
    console.log(validateResult);
    if (validateResult.status !== STATUS.STATUS_ACCEPTED) {
        const message = `${validateResult.stdout || ''}\n${validateResult.stderr || ''}`.trim();
        return ctx.end({ status: STATUS.STATUS_FORMAT_ERROR, message });
    }
    const copyIn = { ...execute.copyIn };
    const { filename } = ctx.config;
    if (filename) copyIn[`${filename}.in`] = { src: input };
    const res = await run(
        execute.execute,
        {
            stdin: filename ? null : { src: input },
            copyIn,
            copyOutCached: [filename ? `${filename}.out?` : 'stdout', 'stderr'],
            time: parseTimeMS(ctx.config.time || '1s') * execute.time,
            memory: parseMemoryMB(ctx.config.memory || '256m'),
        },
    );
    const { code, time, memory } = res;
    let { status } = res;
    let stdout: CmdFile = { fileId: res.fileIds[filename ? `${filename}.out` : 'stdout'] };
    console.log(res);
    if (!stdout.fileId) stdout = { content: '' };
    let message: any = '';
    if (status === STATUS.STATUS_ACCEPTED) {
        if (time > ctx.config.time * execute.time) {
            status = STATUS.STATUS_TIME_LIMIT_EXCEEDED;
        } else if (memory > ctx.config.memory * 1024) {
            status = STATUS.STATUS_MEMORY_LIMIT_EXCEEDED;
        } else {
            ({ status, message } = await checkers[ctx.config.checker_type]({
                execute: checker.execute,
                copyIn: checker.copyIn || {},
                input: { src: input },
                output: { content: '' },
                user_stdout: stdout,
                user_stderr: { fileId: res.fileIds['stderr'] },
                score: 100,
                detail: ctx.config.detail ?? true,
                env: { ...ctx.env, HYDRO_TESTCASE: '0' },
            }));
        }
    } else if (status === STATUS.STATUS_RUNTIME_ERROR && code) {
        if (code < 32) message = signals[code];
        else message = { message: 'Your program returned {0}.', params: [code] };
    }
    await Promise.all(
        Object.values(res.fileIds).map((id) => del(id)),
    ).catch(() => { /* Ignore file doesn't exist */ });

    if (message) ctx.next({ message });

    return ctx.end({
        status: status === STATUS.STATUS_ACCEPTED ? STATUS.STATUS_HACK_UNSUCCESSFUL : STATUS.STATUS_HACK_SUCCESSFUL,
        score: 0,
        time,
        memory,
    });
}
