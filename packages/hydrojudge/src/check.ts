import { findFileSync } from '@hydrooj/utils/lib/utils';
import checkers from './checkers';
import compile from './compile';
import { SystemError } from './error';
import { CheckConfig, Execute } from './interface';

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
    const s = checker.replace('@', '.').split('.');
    let lang;
    let langId = s.pop();
    while (s.length) {
        lang = getLang(langId, false);
        if (lang) break;
        langId = `${s.pop()}.${langId}`;
    }
    if (!lang) throw new SystemError('Unknown checker language.');
    // TODO cache compiled checker
    return await compile(lang, { src: checker }, copyIn);
}
