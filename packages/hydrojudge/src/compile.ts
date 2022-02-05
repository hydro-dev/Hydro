import { LangConfig } from '@hydrooj/utils/lib/lang';
import { STATUS } from '@hydrooj/utils/lib/status';
import { CompileError } from './error';
import { Execute } from './interface';
import { del, run } from './sandbox';
import { CopyInFile } from './sandbox/interface';
import { compilerText } from './utils';

export = async function compile(
    lang: LangConfig, code: string, target: string, copyIn: Record<string, CopyInFile> = {}, next?: Function,
): Promise<Execute> {
    target = lang.target || target;
    copyIn[lang.code_file] = { content: code };
    if (lang.compile) {
        const {
            status, stdout, stderr, fileIds,
        } = await run(
            lang.compile.replace(/\$\{name\}/g, target),
            { copyIn, copyOutCached: [target] },
        );
        if (status !== STATUS.STATUS_ACCEPTED) throw new CompileError({ status, stdout, stderr });
        if (!fileIds[target]) throw new CompileError({ stderr: 'Executable file not found.' });
        if (next) next({ compiler_text: compilerText(stdout, stderr) });
        return {
            execute: lang.execute,
            copyIn: { ...copyIn, [target]: { fileId: fileIds[target] } },
            clean: () => del(fileIds[target]),
            time: lang.time_limit_rate || 1,
        };
    }
    return {
        execute: lang.execute, copyIn, clean: () => Promise.resolve(null), time: lang.time_limit_rate || 1,
    };
};
