import fs from 'fs-extra';
import checkers from './checkers';
import compile from './compile';
import { SystemError } from './error';

export async function check(config): Promise<[number, number, string]> {
    if (!checkers[config.checker_type]) throw new SystemError(`未知比较器类型：${config.checker_type}`);
    const {
        code, status, score, message,
    } = await checkers[config.checker_type]({
        input: config.stdin,
        output: config.stdout,
        user_stdout: config.user_stdout,
        user_stderr: config.user_stderr,
        score: config.score,
        copyIn: config.copyIn || {},
        detail: config.detail,
    });
    if (code) throw new SystemError(`比较器返回了非零值：${code}`);
    return [status, score, message];
}

export async function compileChecker(checkerType: string, checker: string, copyIn: any) {
    if (!checkers[checkerType]) { throw new SystemError(`未知比较器类型：${checkerType}`); }
    const file = await fs.readFile(checker);
    // TODO cache compiled checker
    return await compile(checker.split('.')[1], file.toString(), 'checker', copyIn);
}
