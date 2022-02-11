import fs from 'fs-extra';
import { findFileSync } from '@hydrooj/utils/lib/utils';
import checkers from './checkers';
import compile from './compile';
import { SystemError } from './error';
import { CheckConfig, Execute } from './interface';
import { parseFilename } from './utils';

const testlibSrc = findFileSync('@hydrooj/hydrojudge/vendor/testlib/testlib.h');

export async function check(config: CheckConfig): Promise<[number, number, string]> {
    if (!checkers[config.checker_type]) throw new SystemError('Unknown checker type {0}', [config.checker_type]);
    const {
        code, status, score, message,
    } = await checkers[config.checker_type](config);
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
