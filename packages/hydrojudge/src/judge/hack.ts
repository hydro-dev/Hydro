// Not implemented
import path from 'path';
import fs from 'fs-extra';
import { STATUS } from '@hydrooj/utils/lib/status';
import { check, compileChecker } from '../check';
import compile from '../compile';
import { CompileError } from '../error';
import { run } from '../sandbox';
import signals from '../signals';
import { copyInDir, parseFilename } from '../utils';

export const judge = async (ctx) => {
    if (ctx.config.template) {
        if (ctx.config.template[ctx.lang]) {
            const tpl = ctx.config.template[ctx.lang];
            ctx.code = tpl[0] + ctx.code + tpl[1];
        } else throw new CompileError('Language not supported by provided templates');
    }
    ctx.next({ status: STATUS.STATUS_COMPILING });
    if (!ctx.config.validator || !ctx.config.std) throw new CompileError('config.validator or config.std is missing.');
    const [execute, executeValidator, executeStd, executeChecker] = await Promise.all([
        // UserProgram
        (() => {
            const copyIn = {};
            for (const file of ctx.config.user_extra_files) {
                copyIn[parseFilename(file)] = { src: file };
            }
            return compile(ctx.getLang(ctx.lang), ctx.code, 'code', copyIn, ctx.next);
        })(),
        // Validator
        (async () => {
            const copyIn = {};
            for (const file of ctx.config.judge_extra_files) {
                copyIn[parseFilename(file)] = { src: file };
            }
            const file = await fs.readFile(ctx.config.validator);
            return await compile(ctx.getLang(parseFilename(ctx.config.validator).split('.')[1]), file.toString(), 'validator', copyIn);
        })(),
        // Std
        (async () => {
            const copyIn = {};
            for (const file of ctx.config.user_extra_files) {
                copyIn[parseFilename(file)] = { src: file };
            }
            const file = await fs.readFile(ctx.config.std);
            return await compile(ctx.getLang(parseFilename(ctx.config.std).split('.')[1]), file.toString(), 'std', copyIn);
        })(),
        // Checker
        (() => {
            if (!ctx.config.checker_type || ctx.config.checker_type === 'default') return null;
            const copyIn = {};
            for (const file of ctx.config.judge_extra_files) {
                copyIn[parseFilename(file)] = { src: file };
            }
            return compileChecker(
                ctx.getLang,
                ctx.config.checker_type,
                ctx.config.checker,
                copyIn,
            );
        })(),
    ]);
    ctx.clean.push(execute.clean, executeValidator.clean, executeStd.clean, executeChecker.clean);
    ctx.next({ status: STATUS.STATUS_JUDGING, progress: 0 });
    const { filename } = ctx.config;
    const input = path.resolve(ctx.tmpdir, 'input');
    await fs.writeFile(input, ctx.config.hack);
    if (filename) execute.copyIn[`${filename}.in`] = { src: input };
    const copyOut = filename ? [`${filename}.out`] : [];
    const stdin = filename ? null : input;
    const stdout = path.resolve(ctx.tmpdir, 'user.out');
    const stderr = path.resolve(ctx.tmpdir, 'user.err');
    const res = await run(
        ctx.execute.execute.replace(/\$\{name\}/g, 'code'),
        {
            stdin,
            stdout: filename ? null : stdout,
            stderr,
            copyIn: execute.copyIn,
            copyOut,
            time: 1000,
            memory: 512,
        },
    );
    const { code, time_usage_ms, memory_usage_kb } = res;
    let { status } = res;
    if (res.files[`${filename}.out`] || !fs.existsSync(stdout)) {
        fs.writeFileSync(stdout, res.files[`${filename}.out`] || '');
    }
    let message = '';
    if (status === STATUS.STATUS_ACCEPTED) {
        if (time_usage_ms > 1000) {
            status = STATUS.STATUS_TIME_LIMIT_EXCEEDED;
        } else if (memory_usage_kb > 512 * 1024) {
            status = STATUS.STATUS_MEMORY_LIMIT_EXCEEDED;
        } else {
            [status, , message] = await check({
                copyIn: copyInDir(path.resolve(ctx.tmpdir, 'checker')),
                stdin: input,
                stdout,
                user_stdout: stdout,
                user_stderr: stderr,
                checker: ctx.config.checker,
                checker_type: ctx.config.checker_type,
                score: 100,
                detail: ctx.config.detail,
            });
        }
    } else if (status === STATUS.STATUS_RUNTIME_ERROR && code) {
        if (code < 32) message = signals[code];
        else message = `您的程序返回了 ${code}.`;
    }
    ctx.next({
        status: STATUS.STATUS_JUDGING,
        case: {
            status,
            score: 0,
            time_ms: time_usage_ms,
            memory_kb: memory_usage_kb,
            message,
        },
    });

    ctx.stat.done = new Date();
    ctx.next({ message: JSON.stringify(ctx.stat) });
    ctx.end({
        status,
        score: ctx.total_score,
        time_ms: Math.floor(ctx.total_time_usage_ms * 1000000) / 1000000,
        memory_kb: ctx.total_memory_usage_kb,
    });
};
