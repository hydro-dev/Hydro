import path from 'path';
import fs from 'fs-extra';
import yaml from 'js-yaml';
import { max, sum } from 'lodash';
import readYamlCases, { convertIniConfig } from '@hydrooj/utils/lib/cases';
import { changeErrorType } from '@hydrooj/utils/lib/utils';
import { getConfig } from './config';
import { FormatError, SystemError } from './error';
import { ensureFile, parseMemoryMB, parseTimeMS } from './utils';

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
            (a) => `${a[1] + a[2]}.txt`.replace(/input/g, 'output'),
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
        reg: /^([^\d]*)([0-9]+)-([0-9]+).in$/,
        output: [(a) => `${a[1] + a[2]}-${a[3]}.out`],
        subtask: (a) => +a[2],
        id: (a) => +a[3],
    },
];

async function read0(folder: string, files: string[], checkFile, cfg) {
    const cases = [];
    for (const file of files) {
        for (const REG of RE0) {
            if (REG.reg.test(file)) {
                const data = REG.reg.exec(file);
                const c = { input: file, output: '', id: REG.id(data) };
                for (const func of REG.output) {
                    if (cfg.noOutputFile) c.output = '/dev/null';
                    else c.output = func(data);
                    if (c.output === '/dev/null' || fs.existsSync(path.resolve(folder, c.output))) {
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

async function read1(folder: string, files: string[], checkFile, cfg, rst) {
    const subtask = {};
    for (const s of rst.subtasks) if (s.id) subtask[s.id] = s;
    const subtasks = [];
    for (const file of files) {
        for (const REG of RE1) {
            if (REG.reg.test(file)) {
                const data = REG.reg.exec(file);
                const c = { input: file, output: '', id: REG.id(data) };
                for (const func of REG.output) {
                    if (cfg.noOutputFile) c.output = '/dev/null';
                    else c.output = func(data);
                    if (c.output === '/dev/null' || fs.existsSync(path.resolve(folder, c.output))) {
                        if (!subtask[REG.subtask(data)]) {
                            subtask[REG.subtask(data)] = [{
                                time: parseTimeMS(cfg.time || '1s'),
                                memory: parseMemoryMB(cfg.memory || '256m'),
                                type: 'min',
                                cases: [c],
                            }];
                        } else if (!subtask[REG.subtask(data)].cases) subtask[REG.subtask(data)].cases = [c];
                        else subtask[REG.subtask(data)].cases.push(c);
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

async function readAutoCases(folder, { next }, cfg, rst) {
    const config = {
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
        let result = await read0(folder, files, checkFile, cfg);
        if (!result.count) result = await read1(folder, files, checkFile, cfg, rst);
        Object.assign(config, result);
        next({ message: { message: 'Found {0} testcases.', params: [config.count] } });
    } catch (e) {
        throw new SystemError('Cannot parse testdata.', [e.message, ...e.params]);
    }
    return config;
}

function isValidConfig(config) {
    if (config.type === 'submit_answer' && !config.outputs.length) throw new FormatError('Problem data not found.');
    if (config.count > (getConfig('testcases_max') || 100)) {
        throw new FormatError('Too many testcases. Cancelled.');
    }
    const total_time = sum(config.subtasks.map((subtask) => subtask.time * subtask.cases.length));
    if (total_time > (getConfig('total_time_limit') || 60) * 1000) {
        throw new FormatError('Total time limit longer than {0}s. Cancelled.', [+getConfig('total_time_limit') || 60]);
    }
    const memMax = max(config.subtasks.map((subtask) => subtask.memory));
    if (memMax > parseMemoryMB(getConfig('memoryMax'))) throw new FormatError('Memory limit larger than memory_max');
}

export default async function readCases(folder: string, cfg: Record<string, any> = {}, args) {
    const iniConfig = path.resolve(folder, 'config.ini');
    const yamlConfig = path.resolve(folder, 'config.yaml');
    const ymlConfig = path.resolve(folder, 'config.yml');
    let config;
    if (fs.existsSync(yamlConfig)) {
        config = { ...yaml.load(fs.readFileSync(yamlConfig).toString()) as object, ...cfg };
    } else if (fs.existsSync(ymlConfig)) {
        config = { ...yaml.load(fs.readFileSync(ymlConfig).toString()) as object, ...cfg };
    } else if (fs.existsSync(iniConfig)) {
        try {
            config = { ...convertIniConfig(fs.readFileSync(iniConfig).toString()), ...cfg };
        } catch (e) {
            throw changeErrorType(e, FormatError);
        }
    } else config = cfg;
    let result;
    try {
        result = await readYamlCases(config, ensureFile(folder));
    } catch (e) {
        throw changeErrorType(e, FormatError);
    }
    let auto = !result.outputs?.length;
    if (auto) {
        if (result.subtasks.length && Math.sum(result.subtasks.map((subtask) => subtask.cases.length))) {
            auto = false;
        }
    }
    if (auto) {
        const c = await readAutoCases(folder, args, config, result);
        result.subtasks = c.subtasks;
        result.count = c.count;
    }
    if ((!args.key) || args.key !== result.key) isValidConfig(result);
    return result;
}
