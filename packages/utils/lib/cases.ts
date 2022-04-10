import { findFileSync, parseMemoryMB, parseTimeMS } from './utils';

interface Re0 {
    reg: RegExp,
    output: ((a: RegExpExecArray) => string)[],
    id: (a: RegExpExecArray) => number,
}

interface Re1 extends Re0 {
    subtask: (a: RegExpExecArray) => number,
}

const RE0: Re0[] = [
    {
        reg: /^([^\d]*)(\d+).(in|txt)$/,
        output: [
            (a) => `${a[1] + a[2]}.out`,
            (a) => `${a[1] + a[2]}.ans`,
            (a) => `${a[1] + a[2]}.out`.replace(/input/g, 'output'),
            (a) => (a[1].includes('input') ? `${a[1] + a[2]}.txt`.replace(/input/g, 'output') : null),
        ],
        id: (a) => +a[2],
    },
    {
        reg: /^([^\d]*)\.in(\d+)$/,
        output: [
            (a) => `${a[1]}.ou${a[2]}`,
            (a) => `${a[1]}.ou${a[2]}`.replace(/input/g, 'output'),
        ],
        id: (a) => +a[2],
    },
];
const RE1: Re1[] = [
    {
        reg: /^([^\d]*)([0-9]+)([-_])([0-9]+).in$/,
        output: [(a) => `${a[1] + a[2]}${a[3]}${a[4]}.out`],
        subtask: (a) => +a[2],
        id: (a) => +a[4],
    },
];

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default async function readYamlCases(cfg: Record<string, any> = {}, checkFile = (s: string, errMsg: string) => s) {
    const config: any = {
        checker_type: 'default',
        count: 0,
        subtasks: [],
        judge_extra_files: [],
        user_extra_files: [],
    };
    config.checker_type = cfg.checker_type || 'default';
    if (cfg.checker) {
        if (!cfg.checker.includes('.')) {
            config.checker = findFileSync(`@hydrooj/hydrojudge/vendor/testlib/checkers/${cfg.checker}.cpp`, false);
        }
        if (!config.checker) config.checker = checkFile(cfg.checker, 'Cannot find checker {0}.');
    }
    if (cfg.interactor) config.interactor = checkFile(cfg.interactor, 'Cannot find interactor {0}.');
    if (cfg.judge_extra_files) {
        if (typeof cfg.judge_extra_files === 'string') {
            config.judge_extra_files = [checkFile(cfg.judge_extra_files, 'Cannot find judge extra file {0}.')];
        } else if (cfg.judge_extra_files instanceof Array) {
            for (const file of cfg.judge_extra_files) {
                config.judge_extra_files.push(checkFile(file, 'Cannot find judge extra file {0}.'));
            }
        } else throw new Error('Invalid judge_extra_files config.');
    }
    if (cfg.user_extra_files) {
        if (typeof cfg.user_extra_files === 'string') {
            config.user_extra_files = [checkFile(cfg.user_extra_files, 'Cannot find user extra file {0}.')];
        } else if (cfg.user_extra_files instanceof Array) {
            for (const file of cfg.user_extra_files) {
                config.user_extra_files.push(checkFile(file, 'Cannot find user extra file {0}.'));
            }
        } else throw new Error('Invalid user_extra_files config.');
    }
    if (cfg.outputs) {
        config.type = cfg.type || 'objective';
    } else if (cfg.cases?.length) {
        config.subtasks = [{
            score: +cfg.score || Math.floor(100 / cfg.cases.length),
            time: parseTimeMS(cfg.time || '1s'),
            memory: parseMemoryMB(cfg.memory || '256m'),
            cases: [],
            type: 'sum',
        }];
        for (const c of cfg.cases) {
            config.count++;
            config.subtasks[0].cases.push({
                input: c.input ? checkFile(c.input, 'Cannot find input file {0}.') : '/dev/null',
                output: c.output ? checkFile(c.output, 'Cannot find output file {0}.') : '/dev/null',
                id: config.count,
            });
        }
    } else if (cfg.subtasks?.length) {
        for (const subtask of cfg.subtasks) {
            const cases = [];
            for (const c of subtask.cases || []) {
                config.count++;
                cases.push({
                    input: c.input ? checkFile(c.input, 'Cannot find input file {0}.') : '/dev/null',
                    output: c.output ? checkFile(c.output, 'Cannot find output file {0}.') : '/dev/null',
                    id: config.count,
                });
            }
            config.subtasks.push({
                score: Number.isSafeInteger(+subtask.score) ? +subtask.score : 100,
                if: subtask.if || [],
                cases,
                type: subtask.type || 'min',
                time: parseTimeMS(subtask.time || cfg.time || '1s'),
                memory: parseMemoryMB(subtask.memory || cfg.memory || '256m'),
            });
        }
    }
    if (cfg.time) config.time = parseTimeMS(cfg.time);
    if (cfg.memory) config.memory = parseMemoryMB(cfg.memory);
    if (config.type === 'objective' && !cfg.outputs?.length) throw new Error('outputs config not found');
    return Object.assign(cfg, config);
}

export function convertIniConfig(ini: string) {
    const f = ini.split('\n');
    const count = parseInt(f[0], 10);
    const res = { subtasks: [] };
    for (let i = 1; i <= count; i++) {
        if (!f[i] || !f[i].trim()) throw new Error('Testcada count incorrect.');
        const [input, output, time, score, memory] = f[i].split('|');
        const cur = {
            cases: [{ input: `input/${input.toLowerCase()}`, output: `output/${output.toLowerCase()}` }],
            score: parseInt(score, 10),
            time: `${time}s`,
            memory: '256m',
        };
        if (!Number.isNaN(parseInt(memory, 10))) cur.memory = `${Math.floor(parseInt(memory, 10) / 1024)}m`;
        res.subtasks.push(cur);
    }
    return res;
}

export async function readCasesFromFiles(files: string[], checkFile, cfg) {
    const cases = [];
    for (const file of files) {
        for (const REG of RE0) {
            if (REG.reg.test(file)) {
                const data = REG.reg.exec(file);
                const c = { input: file, output: '', id: REG.id(data) };
                for (const func of REG.output) {
                    if (cfg.noOutputFile) c.output = '/dev/null';
                    else c.output = func(data);
                    if (c.output && (c.output === '/dev/null' || checkFile(c.output))) {
                        cases.push(c);
                        break;
                    }
                }
            }
        }
    }
    cases.sort((a, b) => (a.id - b.id));
    const extra = cases.length - (100 % cases.length);
    const config = {
        count: 0,
        subtasks: [{
            time: parseTimeMS(cfg.time || '1s'),
            memory: parseMemoryMB(cfg.memory || '256m'),
            type: 'sum',
            cases: [],
            score: Math.floor(100 / cases.length),
        }],
    };
    for (let i = 0; i < extra; i++) {
        config.count++;
        config.subtasks[0].cases.push({
            id: config.count,
            input: checkFile(cases[i].input),
            output: checkFile(cases[i].output),
        });
    }
    if (extra < cases.length) {
        config.subtasks.push({
            time: parseTimeMS(cfg.time || '1s'),
            memory: parseMemoryMB(cfg.memory || '256m'),
            type: 'sum',
            cases: [],
            score: Math.floor(100 / cases.length) + 1,
        });
        for (let i = extra; i < cases.length; i++) {
            config.count++;
            config.subtasks[1].cases.push({
                id: config.count,
                input: checkFile(cases[i].input),
                output: checkFile(cases[i].output),
            });
        }
    }
    return config;
}

export async function readSubtasksFromFiles(files: string[], checkFile, cfg, rst) {
    const subtask = {};
    for (const s of rst.subtasks) if (s.id) subtask[s.id] = s;
    const subtasks = [];
    for (const file of files) {
        for (const REG of RE1) {
            if (REG.reg.test(file)) {
                const data = REG.reg.exec(file);
                const sid = REG.subtask(data);
                const c = { input: file, output: '', id: REG.id(data) };
                for (const func of REG.output) {
                    if (cfg.noOutputFile) c.output = '/dev/null';
                    else c.output = func(data);
                    if (c.output === '/dev/null' || checkFile(c.output)) {
                        if (!subtask[sid]) {
                            subtask[sid] = {
                                time: parseTimeMS(cfg.time || '1s'),
                                memory: parseMemoryMB(cfg.memory || '256m'),
                                type: 'min',
                                cases: [c],
                            };
                        } else if (!subtask[sid].cases) subtask[sid].cases = [c];
                        else subtask[sid].cases.push(c);
                        break;
                    }
                }
            }
        }
    }
    for (const i in subtask) {
        subtask[i].cases.sort((a, b) => (a.id - b.id));
        subtasks.push(subtask[i]);
    }
    const base = Math.floor(100 / subtasks.length);
    const extra = subtasks.length - (100 % subtasks.length);
    const config = { count: 0, subtasks };
    const keys = Object.keys(subtask);
    for (let i = 0; i < keys.length; i++) {
        if (i >= extra) subtask[keys[i]].score = base + 1;
        else subtask[keys[i]].score = base;
        for (const j of subtask[keys[i]].cases) {
            config.count++;
            j.input = checkFile(j.input);
            j.output = checkFile(j.output);
            j.id = config.count;
        }
    }
    return config;
}
