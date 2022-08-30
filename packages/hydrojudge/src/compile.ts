import { LangConfig } from '@hydrooj/utils/lib/lang';
import { STATUS } from '@hydrooj/utils/lib/status';
import { findFileSync } from '@hydrooj/utils/lib/utils';
import checkers from './checkers';
import { CompileError, FormatError } from './error';
import { Execute } from './interface';
import { CopyInFile, del, run } from './sandbox';
import { compilerText } from './utils';

export default async function compile(
    lang: LangConfig, code: CopyInFile, copyIn: Record<string, CopyInFile> = {}, next?: Function,
): Promise<Execute> {
    const target = lang.target || 'foo';
    const execute = copyIn['execute.sh'] ? '/bin/bash execute.sh' : lang.execute;
    const time = lang.time_limit_rate || 1;
    if (lang.compile) {
        const {
            status, stdout, stderr, fileIds,
        } = await run(
            copyIn['compile.sh'] ? '/bin/bash compile.sh' : lang.compile,
            {
                copyIn: { ...copyIn, [lang.code_file]: code },
                copyOutCached: [target],
                env: { HYDRO_LANG: lang.key },
            },
        );
        if (status !== STATUS.STATUS_ACCEPTED) throw new CompileError({ status, stdout, stderr });
        if (!fileIds[target]) throw new CompileError({ stderr: 'Executable file not found.' });
        next?.({ compilerText: compilerText(stdout, stderr) });
        return {
            execute,
            copyIn: { ...copyIn, [target]: { fileId: fileIds[target] } },
            clean: () => del(fileIds[target]),
            time,
        };
    }
    return {
        execute,
        copyIn: { ...copyIn, [lang.code_file]: code },
        clean: () => Promise.resolve(null),
        time,
    };
}

const testlibSrc = findFileSync('@hydrooj/hydrojudge/vendor/testlib/testlib.h');

export async function compileChecker(getLang: Function, checkerType: string, checker: string, copyIn: any): Promise<Execute> {
    if (['default', 'strict'].includes(checkerType)) {
        return { execute: '', copyIn: {}, clean: () => Promise.resolve(null) };
    }
    if (!checkers[checkerType]) throw new FormatError('Unknown checker type {0}.', [checkerType]);
    if (checkerType === 'testlib') copyIn['testlib.h'] = { src: testlibSrc };
    const s = checker.replace('@', '.').split('.');
    let lang;
    let langId = s.pop();
    while (s.length) {
        lang = getLang(langId, false);
        if (lang) break;
        langId = `${s.pop()}.${langId}`;
    }
    if (!lang) throw new FormatError('Unknown checker language.');
    // TODO cache compiled checker
    return await compile(lang, { src: checker }, copyIn);
}
