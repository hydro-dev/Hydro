import { LangConfig } from '@hydrooj/utils/lib/lang';
import { STATUS } from '@hydrooj/utils/lib/status';
import { findFileSync } from '@hydrooj/utils/lib/utils';
import { CompileError, FormatError } from './error';
import { Execute } from './interface';
import {
    CopyIn, CopyInFile, del, runQueued,
} from './sandbox';
import { compilerText } from './utils';

export default async function compile(
    lang: LangConfig, code: CopyInFile, copyIn: CopyIn = {}, next?: Function,
): Promise<Execute> {
    const target = lang.target || 'foo';
    const execute = copyIn['execute.sh'] ? '/bin/bash execute.sh' : lang.execute;
    if (lang.compile) {
        const {
            status, stdout, stderr, fileIds,
        } = await runQueued(
            copyIn['compile.sh'] ? '/bin/bash compile.sh' : lang.compile,
            {
                copyIn: { ...copyIn, [lang.code_file]: code },
                copyOutCached: [target],
                env: { HYDRO_LANG: lang.key },
                time: lang.compile_time_limit || 10000,
                memory: lang.compile_memory_limit || 256 * 1024 * 1024,
            },
            3,
        );
        // TODO: distinguish user program and checker
        if (status === STATUS.STATUS_TIME_LIMIT_EXCEEDED) next?.({ message: 'Compile timeout.' });
        if (status === STATUS.STATUS_MEMORY_LIMIT_EXCEEDED) next?.({ message: 'Compile memory limit exceeded.' });
        if (status !== STATUS.STATUS_ACCEPTED) throw new CompileError({ status, stdout, stderr });
        if (!fileIds[target]) throw new CompileError({ stderr: 'Executable file not found.' });
        next?.({ compilerText: compilerText(stdout, stderr) });
        return {
            execute,
            copyIn: { ...copyIn, [target]: { fileId: fileIds[target] } },
            clean: () => del(fileIds[target]),
        };
    }
    return {
        execute,
        copyIn: { ...copyIn, [lang.code_file]: code },
        clean: () => Promise.resolve(null),
    };
}

const testlibFile = {
    src: findFileSync('@hydrooj/hydrojudge/vendor/testlib/testlib.h'),
};

export async function compileLocalFile(
    src: string, type: 'checker' | 'validator' | 'interactor' | 'generator' | 'std',
    getLang, copyIn: CopyIn, withTestlib = true, next?: any,
) {
    const s = src.replace('@', '.').split('.');
    let lang;
    let langId = s.pop();
    while (s.length) {
        lang = getLang(langId, false);
        if (lang) break;
        langId = `${s.pop()}.${langId}`;
    }
    if (!lang) throw new FormatError(`Unknown ${type} language.`);
    if (withTestlib) copyIn = { ...copyIn, 'testlib.h': testlibFile };
    // TODO cache compiled binary
    return await compile(lang, { src }, copyIn, next);
}
