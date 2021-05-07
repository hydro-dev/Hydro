import { LangConfig } from '@hydrooj/utils/lib/lang';
import * as STATUS from './status';
import { run, del } from './sandbox';
import { CompileError } from './error';
import { compilerText } from './utils';
import { Execute } from './interface';

export = async function compile(
    lang: LangConfig, code: string, target: string, copyIn: any, next?: Function,
): Promise<Execute> {
    target = lang.target || target;
    const f = {};
    if (lang.compile) {
        copyIn[lang.code_file] = { content: code };
        const {
            status, stdout, stderr, fileIds,
        } = await run(
            lang.compile.replace(/\$\{name\}/g, target),
            { copyIn, copyOutCached: [target] },
        );
        if (status !== STATUS.STATUS_ACCEPTED) throw new CompileError({ status, stdout, stderr });
        if (!fileIds[target]) throw new CompileError({ stderr: 'Executable file not found.' });
        if (next) next({ compiler_text: compilerText(stdout, stderr) });
        f[target] = { fileId: fileIds[target] };
        return {
            execute: lang.execute, copyIn: f, clean: () => del(fileIds[target]), time: lang.time_limit_rate || 1,
        };
    }
    f[target] = { content: code };
    return {
        execute: lang.execute, copyIn: f, clean: () => Promise.resolve(null), time: lang.time_limit_rate || 1,
    };
};
