import { findFileSync, parseMemoryMB, parseTimeMS } from '@hydrooj/utils';
import { CompilableSource, ProblemConfigFile } from './types';

// eslint-disable-next-line ts/no-unused-vars
export async function readYamlCases(cfg: ProblemConfigFile = {}, checkFile = (s: CompilableSource, errMsg: string) => s) {
    const config: any = {
        checker_type: cfg.checker_type || 'default',
        judge_extra_files: [],
        user_extra_files: [],
    };
    const checkFileWithLang = (s: CompilableSource, errMsg: string) => {
        if (typeof s === 'string') return { lang: 'auto', file: checkFile(s, errMsg) };
        return { lang: s.lang, file: checkFile(s.file, errMsg) };
    };
    if (cfg.type === 'objective') {
        if (cfg.checker || cfg.interactor || cfg.validator) {
            throw new Error('You cannot use checker, interactor or validator for objective questions');
        }
    } else {
        if (cfg.checker) {
            const [name, lang] = typeof cfg.checker === 'string' ? [cfg.checker, 'auto'] : [cfg.checker.file, cfg.checker.lang || 'auto'];
            if (!name.includes('.')) {
                config.checker = {
                    lang,
                    file: findFileSync(`@hydrooj/hydrojudge/vendor/testlib/checkers/${name}.cpp`, false),
                };
            }
            config.checker ||= checkFileWithLang(name, 'Cannot find checker {0}.');
        }
        if (cfg.interactor) config.interactor = checkFileWithLang(cfg.interactor, 'Cannot find interactor {0}.');
        if (cfg.manager) config.manager = checkFileWithLang(cfg.manager, 'Cannot find Manager {0}.');
        if (cfg.validator) config.validator = checkFileWithLang(cfg.validator, 'Cannot find validator {0}.');
        for (const n of ['judge', 'user']) {
            const conf = cfg[`${n}_extra_files`];
            if (!conf) continue;
            if (conf instanceof Array) {
                config[`${n}_extra_files`] = conf.map((file) => checkFile(file, `Cannot find ${n} extra file {0}.`));
            } else throw new Error(`Invalid ${n}_extra_files config.`);
        }
    }
    if (cfg.cases?.length) {
        config.subtasks = [{
            cases: cfg.cases,
            type: 'sum',
        }];
    }
    if (cfg.time) config.time = parseTimeMS(cfg.time);
    if (cfg.memory) config.memory = parseMemoryMB(cfg.memory);
    return Object.assign(cfg, config);
}
