import { LangConfig } from '@hydrooj/utils/lib/lang';
import { STATUS } from '@hydrooj/utils/lib/status';
import { CompileError } from './error';
import { Execute } from './interface';
import { del, run } from './sandbox';
import { CopyInFile } from './sandbox/interface';
import { compilerText } from './utils';

export = async function compile(
    lang: LangConfig, code: string, copyIn: Record<string, CopyInFile> = {}, next?: Function,
): Promise<Execute> {
    const target = lang.target || 'foo';
    const execute = copyIn['execute.sh'] ? '/bin/bash execute.sh' : lang.execute;
    const time = lang.time_limit_rate || 1;
    if (lang.compile) {
        const {
            status, stdout, stderr, fileIds,
        } = await run(
            copyIn['compile.sh'] ? '/bin/bash compile.sh' : lang.compile,
            { copyIn: { ...copyIn, [lang.code_file]: { content: code } }, copyOutCached: [target] },
        );
        if (status !== STATUS.STATUS_ACCEPTED) throw new CompileError({ status, stdout, stderr });
        if (!fileIds[target]) throw new CompileError({ stderr: 'Executable file not found.' });
        if (next) next({ compiler_text: compilerText(stdout, stderr) });
        return {
            execute,
            copyIn: { ...copyIn, [target]: { fileId: fileIds[target] } },
            clean: () => del(fileIds[target]),
            time,
        };
    }
    return {
        execute,
        copyIn: { ...copyIn, [lang.code_file]: { content: code } },
        clean: () => Promise.resolve(null),
        time,
    };
};
