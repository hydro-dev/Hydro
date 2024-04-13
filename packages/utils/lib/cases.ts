import { findFileSync, parseMemoryMB, parseTimeMS } from './utils';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default async function readYamlCases(cfg: Record<string, any> = {}, checkFile = (s: string, errMsg: string) => s) {
    const config: any = {
        checker_type: cfg.checker_type || 'default',
        judge_extra_files: [],
        user_extra_files: [],
    };
    if (cfg.type === 'objective') {
        if (cfg.checker || cfg.interactor || cfg.validator) {
            throw new Error('You cannot use checker, interactor or validator for objective questions');
        }
    } else {
        if (cfg.checker) {
            if (!cfg.checker.includes('.')) {
                config.checker = findFileSync(`@hydrooj/hydrojudge/vendor/testlib/checkers/${cfg.checker}.cpp`, false);
            }
            config.checker ||= checkFile(cfg.checker, 'Cannot find checker {0}.');
        }
        if (cfg.interactor) config.interactor = checkFile(cfg.interactor, 'Cannot find interactor {0}.');
        if (cfg.validator) config.validator = checkFile(cfg.validator, 'Cannot find validator {0}.');
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

export function convertIniConfig(ini: string) {
    const f = ini.split('\n');
    const count = parseInt(f[0], 10);
    const res = { subtasks: [] };
    for (let i = 1; i <= count; i++) {
        if (!f[i]?.trim()) throw new Error('Testdata count incorrect.');
        const [input, output, time, score, memory] = f[i].split('|');
        const cur = {
            cases: [{ input, output }],
            score: parseInt(score, 10),
            time: `${time}s`,
            memory: '256m',
        };
        if (!Number.isNaN(parseInt(memory, 10))) cur.memory = `${Math.floor(parseInt(memory, 10) / 1024)}m`;
        res.subtasks.push(cur);
    }
    return res;
}
