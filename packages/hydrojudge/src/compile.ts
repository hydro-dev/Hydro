import yaml from 'js-yaml';
import * as STATUS from './status';
import { run, del } from './sandbox';
import { CompileError, SystemError } from './error';
import { compilerText } from './utils';
import { Execute } from './interface';

export = async function compile(
    lang: string, code: string, target: string, copyIn: any, next?: Function,
): Promise<Execute> {
    const LANGS = global.Hydro
        ? yaml.safeLoad(await global.Hydro.model.system.get('hydrojudge.langs'))
        : require('./config').LANGS;
    if (!LANGS[lang]) throw new SystemError('Unsupported language {0}.', [lang]);
    const info = LANGS[lang];
    target = info.target || target;
    const f = {};
    if (info.type === 'compiler') {
        copyIn[info.code_file] = { content: code };
        const {
            status, stdout, stderr, fileIds,
        } = await run(
            info.compile.replace(/\$\{name\}/g, target),
            { copyIn, copyOutCached: [target] },
        );
        if (status !== STATUS.STATUS_ACCEPTED) throw new CompileError({ status, stdout, stderr });
        if (!fileIds[target]) throw new CompileError({ stderr: 'Executable file not found.' });
        if (next) next({ compiler_text: compilerText(stdout, stderr) });
        f[target] = { fileId: fileIds[target] };
        return {
            execute: info.execute, copyIn: f, clean: () => del(fileIds[target]), time: info.time || 1,
        };
    } if (info.type === 'interpreter') {
        f[target] = { content: code };
        return {
            execute: info.execute, copyIn: f, clean: () => Promise.resolve(null), time: info.time || 1,
        };
    }
    throw new SystemError('Unknown language type.');
}
