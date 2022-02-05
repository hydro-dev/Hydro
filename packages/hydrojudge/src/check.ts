import fs from 'fs-extra';
import { findFileSync } from '@hydrooj/utils/lib/utils';
import checkers from './checkers';
import compile from './compile';
import { SystemError } from './error';
import { Execute } from './interface';
import { CopyInFile } from './sandbox/interface';
import { parseFilename } from './utils';

const testlibSrc = findFileSync('@hydrooj/hydrojudge/vendor/testlib/testlib.h');

interface CheckConfig {
    checker_type: string;
    stdin: CopyInFile,
    stdout: CopyInFile,
    user_stdout: CopyInFile,
    user_stderr: CopyInFile,
    copyIn?: Record<string, CopyInFile>,
    score: number,
    detail: boolean,
}

export async function check(config: CheckConfig): Promise<[number, number, string]> {
    if (!checkers[config.checker_type]) throw new SystemError('Unknown checker type {0}', [config.checker_type]);
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
    if (code) throw new SystemError('Checker returned {0}.', [code]);
    return [status, score, message];
}

export async function compileChecker(getLang: Function, checkerType: string, checker: string, copyIn: any): Promise<Execute> {
    if (!checkers[checkerType]) throw new SystemError('Unknown checker type {0}.', [checkerType]);
    if (checkerType === 'testlib') copyIn['testlib.h'] = { src: testlibSrc };
    const file = await fs.readFile(checker);
    // TODO cache compiled checker
    return await compile(getLang(parseFilename(checker).split('.')[1].replace('@', '.')), file.toString(), 'checker', copyIn);
}
