import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';
import { Dictionary } from 'lodash';
import { FormatError, SystemError } from './error';
import { parseTimeMS, parseMemoryMB, ensureFile } from './utils';

interface Re0 {
    reg: RegExp,
    output: (a: RegExpExecArray) => string,
    id: (a: RegExpExecArray) => number,
}

interface Re1 extends Re0 {
    subtask: (a: RegExpExecArray) => number,
}

const RE0: Re0[] = [
    {
        reg: /^([a-z+_\-A-Z]*)([0-9]+).in$/,
        output: (a) => `${a[1] + a[2]}.out`,
        id: (a) => parseInt(a[2], 10),
    },
    {
        reg: /^([a-z+_\-A-Z]*)([0-9]+).in$/,
        output: (a) => `${a[1] + a[2]}.ans`,
        id: (a) => parseInt(a[2], 10),
    },
    {
        reg: /^([a-z+_\-A-Z0-9]*)\.in([0-9]+)$/,
        output: (a) => `${a[1]}.ou${a[2]}`,
        id: (a) => parseInt(a[2], 10),
    },
    {
        reg: /^(input)([0-9]+).txt$/,
        output: (a) => `output${a[2]}.txt`,
        id: (a) => parseInt(a[2], 10),
    },
    {
        reg: /^input\/([a-z+_\-A-Z]*)([0-9]+).in$/,
        output: (a) => `output/${a[1] + a[2]}.out`,
        id: (a) => parseInt(a[2], 10),
    },
    {
        reg: /^input\/([a-z+_\-A-Z]*)([0-9]+).in$/,
        output: (a) => `output/${a[1] + a[2]}.ans`,
        id: (a) => parseInt(a[2], 10),
    },
    {
        reg: /^input\/([a-z+_\-A-Z0-9]*)\.in([0-9]+)$/,
        output: (a) => `output/${a[1]}.ou${a[2]}`,
        id: (a) => parseInt(a[2], 10),
    },
    {
        reg: /^input\/(input)([0-9]+).txt$/,
        output: (a) => `output/output${a[2]}.txt`,
        id: (a) => parseInt(a[2], 10),
    },
];
const RE1: Re1[] = [
    {
        reg: /^([a-z+_\-A-Z]*)([0-9]+)-([0-9]+).in$/,
        output: (a) => `${a[1] + a[2]}-${a[3]}.out`,
        subtask: (a) => parseInt(a[2], 10),
        id: (a) => parseInt(a[3], 10),
    },
];

async function read0(folder: string, files: string[], checkFile) {
    const cases = [];
    for (const file of files) {
        for (const REG of RE0) {
            if (REG.reg.test(file)) {
                const data = REG.reg.exec(file);
                const c = { input: file, output: REG.output(data), id: REG.id(data) };
                if (fs.existsSync(path.resolve(folder, c.output))) {
                    cases.push(c);
                    break;
                }
            }
        }
    }
    cases.sort((a, b) => (a.id - b.id));
    const extra = cases.length - (100 % cases.length);
    const config = {
        count: 0,
        subtasks: [{
            time_limit_ms: 1000,
            memory_limit_mb: 256,
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
            time_limit_ms: 1000,
            memory_limit_mb: 256,
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

async function read1(folder: string, files: string[], checkFile) {
    const subtask = {};
    const subtasks = [];
    for (const file of files) {
        for (const REG of RE1) {
            if (REG.reg.test(file)) {
                const data = REG.reg.exec(file);
                const c = { input: file, output: REG.output(data), id: REG.id(data) };
                if (fs.existsSync(path.resolve(folder, c.output))) {
                    if (!subtask[REG.subtask(data)]) {
                        subtask[REG.subtask(data)] = [{
                            time_limit_ms: 1000,
                            memory_limit_mb: 256,
                            type: 'min',
                            cases: [c],
                        }];
                    } else subtask[REG.subtask(data)].cases.push(c);
                    break;
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
        if (extra < i) subtask[keys[i]].score = base;
        else subtask[keys[i]].score = base + 1;
        for (const j of subtask[keys[i]].cases) {
            config.count++;
            j.input = checkFile(j.input);
            j.output = checkFile(j.output);
            j.id = config.count;
        }
    }
    return config;
}

async function readAutoCases(folder, { next }) {
    const
        config = {
            checker_type: 'default',
            count: 0,
            subtasks: [],
            judge_extra_files: [],
            user_extra_files: [],
        };
    const checkFile = ensureFile(folder);
    try {
        const files = await fs.readdir(folder);
        if (await fs.pathExists(path.resolve(folder, 'input'))) {
            const inputs = await fs.readdir(path.resolve(folder, 'input'));
            files.push(...inputs.map((i) => `input/${i}`));
        }
        if (await fs.pathExists(path.resolve(folder, 'output'))) {
            const outputs = await fs.readdir(path.resolve(folder, 'output'));
            files.push(...outputs.map((i) => `output/${i}`));
        }
        let result = await read0(folder, files, checkFile);
        if (!result.count) result = await read1(folder, files, checkFile);
        Object.assign(config, result);
        next({ message: `识别到${config.count}个测试点` });
    } catch (e) {
        throw new SystemError('在自动识别测试点的过程中出现了错误。', [e]);
    }
    return config;
}

export async function readYamlCases(folder: string, cfg: Dictionary<any> = {}, args) {
    const config: any = {
        checker_type: 'default',
        count: 0,
        subtasks: [],
        judge_extra_files: [],
        user_extra_files: [],
    };
    const next = args.next;
    const checkFile = ensureFile(folder);
    config.checker_type = cfg.checker_type || 'default';
    if (cfg.filename) config.filename = cfg.filename;
    if (cfg.checker) config.checker = checkFile(cfg.checker, '找不到比较器 ');
    if (cfg.judge_extra_files) {
        if (typeof cfg.judge_extra_files === 'string') {
            config.judge_extra_files = [checkFile(cfg.judge_extra_files, '找不到评测额外文件 ')];
        } else if (cfg.judge_extra_files instanceof Array) {
            for (const file of cfg.judge_extra_files) {
                config.judge_extra_files.push(checkFile(file, '找不到评测额外文件 '));
            }
        } else throw new FormatError('无效的 judge_extra_files 配置项');
    }
    if (cfg.user_extra_files) {
        if (typeof cfg.user_extra_files === 'string') {
            config.user_extra_files = [checkFile(cfg.user_extra_files, '找不到用户额外文件 ')];
        } else if (cfg.user_extra_files instanceof Array) {
            for (const file of cfg.user_extra_files) {
                config.user_extra_files.push(checkFile(file, '找不到用户额外文件 '));
            }
        } else throw new FormatError('无效的 user_extra_files 配置项');
    }
    if (cfg.cases) {
        config.subtasks = [{
            score: parseInt(cfg.score, 10) || Math.floor(100 / config.count),
            time_limit_ms: parseTimeMS(cfg.time),
            memory_limit_mb: parseMemoryMB(cfg.memory),
            cases: [],
            type: 'sum',
        }];
        for (const c of cfg.cases) {
            config.count++;
            config.subtasks[0].cases.push({
                input: checkFile(c.input, '找不到输入文件 '),
                output: checkFile(c.output, '找不到输出文件 '),
                id: config.count,
            });
        }
    } else if (cfg.subtasks) {
        for (const subtask of cfg.subtasks) {
            const cases = [];
            for (const c of subtask.cases) {
                config.count++;
                cases.push({
                    input: checkFile(c.input, '找不到输入文件 '),
                    output: checkFile(c.output, '找不到输出文件 '),
                    id: config.count,
                });
            }
            config.subtasks.push({
                score: parseInt(subtask.score, 10),
                cases,
                time_limit_ms: parseTimeMS(subtask.time || cfg.time),
                memory_limit_mb: parseMemoryMB(subtask.memory || cfg.time),
            });
        }
    } else {
        const c = await readAutoCases(folder, { next });
        config.subtasks = c.subtasks;
        config.count = c.count;
    }
    return Object.assign(cfg, config);
}

function convertIniConfig(ini: string) {
    const f = ini.split('\n');
    const count = parseInt(f[0], 10);
    const res = { subtasks: [] };
    for (let i = 1; i <= count; i++) {
        const [input, output, time, score, memory] = f[i].split('|');
        const cur = {
            cases: [{ input: `input/${input}`, output: `output/${output}` }],
            score: parseInt(score, 10),
            time: `${time}s`,
            memory: '128m',
        };
        if (!Number.isNaN(parseInt(memory, 10))) cur.memory = `${Math.floor(parseInt(memory, 10) / 1024)}m`;
        res.subtasks.push(cur);
    }
    return res;
}

export default async function readCases(folder: string, cfg: Record<string, any> = {}, args) {
    const iniConfig = path.resolve(folder, 'config.ini');
    const yamlConfig = path.resolve(folder, 'config.yaml');
    let config;
    if (fs.existsSync(yamlConfig)) {
        config = { ...yaml.safeLoad(fs.readFileSync(yamlConfig).toString()) as object, ...cfg };
    } else if (fs.existsSync(iniConfig)) {
        config = { ...convertIniConfig(fs.readFileSync(iniConfig).toString()), ...cfg };
    }
    const result = await readYamlCases(folder, config, args);
    if (result.count > 100) throw new FormatError('测试数据组数过多，拒绝评测');
    return result;
}
