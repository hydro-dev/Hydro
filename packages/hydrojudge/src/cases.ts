/* eslint-disable no-await-in-loop */
import path from 'path';
import fs from 'fs-extra';
import readYamlCases, { convertIniConfig } from '@hydrooj/utils/lib/cases';
import { normalizeSubtasks, readSubtasksFromFiles } from '@hydrooj/utils/lib/common';
import { changeErrorType, yaml } from '@hydrooj/utils/lib/utils';
import { ProblemConfigFile } from 'hydrooj';
import { getConfig } from './config';
import { FormatError, SystemError } from './error';
import { NextFunction, ParsedConfig } from './interface';
import { ensureFile, parseMemoryMB } from './utils';

function isValidConfig(config) {
    if (config.count > (getConfig('testcases_max') || 100)) {
        throw new FormatError('Too many testcases. Cancelled.');
    }
    const time = Math.sum(config.subtasks.map((subtask) => Math.sum(subtask.cases.map((c) => c.time))));
    if (time > (getConfig('total_time_limit') || 60) * 1000) {
        throw new FormatError('Total time limit longer than {0}s. Cancelled.', [+getConfig('total_time_limit') || 60]);
    }
    const memMax = Math.max(config.subtasks.map((subtask) => Math.max(subtask.cases.map((c) => c.memory))));
    if (memMax > parseMemoryMB(getConfig('memoryMax'))) throw new FormatError('Memory limit larger than memory_max');
    if (!['default', 'strict'].includes(config.checker_type || 'default') && !config.checker) {
        throw new FormatError('You did not specify a checker.');
    }
}

async function collectFiles(folder: string) {
    const files = await fs.readdir(folder);
    await Promise.all(['input', 'output'].map(async (t) => {
        if (await fs.pathExists(path.resolve(folder, t))) {
            const f = await fs.readdir(path.resolve(folder, t));
            files.push(...f.map((i) => `${t}/${i}`));
        }
    }));
    return files;
}

export async function processTestdata(folder: string) {
    let files = await fs.readdir(folder);
    if (files.length <= 2) {
        if (files.length === 2) files.splice(files.indexOf('version'), 1);
        if (fs.statSync(path.resolve(folder, files[0])).isDirectory()) {
            folder = path.resolve(folder, files[0]);
            files = await fs.readdir(folder);
        }
    }
    const ini = files.filter((i) => i.toLowerCase() === 'config.ini')[0];
    if (!ini) return;
    const t = await fs.readFile(path.resolve(folder, ini), 'utf8');
    await fs.writeFile(path.resolve(folder, 'config.ini'), t.toLowerCase());
    for (const i of files) {
        if (i.toLowerCase() === 'input') await fs.rename(`${folder}/${i}`, `${folder}/input`);
        if (i.toLowerCase() === 'output') await fs.rename(`${folder}/${i}`, `${folder}/output`);
    }
    await Promise.all(['input', 'output'].flatMap(async (f) => {
        const dir = path.resolve(folder, f);
        const sf = await fs.readdir(dir);
        return sf
            .filter((i) => i !== i.toLowerCase())
            .map((i) => fs.rename(`${dir}/${i}`, `${dir}/${i.toLowerCase()}`));
    }));
}

interface Args {
    next: NextFunction;
    key: string;
    isSelfSubmission: boolean;
}

export default async function readCases(folder: string, cfg: ProblemConfigFile = {}, args: Args): Promise<ParsedConfig> {
    const iniConfig = path.resolve(folder, 'config.ini');
    const yamlConfig = path.resolve(folder, 'config.yaml');
    const ymlConfig = path.resolve(folder, 'config.yml');
    const config: Record<string, any> = {
        checker_type: 'default',
        count: 0,
        subtasks: [],
        judge_extra_files: [],
        user_extra_files: [],
        ...cfg,
    };
    try {
        if (fs.existsSync(yamlConfig)) {
            Object.assign(config, yaml.load(await fs.readFile(yamlConfig, 'utf-8')));
        } else if (fs.existsSync(ymlConfig)) {
            Object.assign(config, yaml.load(await fs.readFile(ymlConfig, 'utf-8')));
        } else if (fs.existsSync(iniConfig)) {
            Object.assign(config, convertIniConfig(await fs.readFile(iniConfig, 'utf-8')));
        }
    } catch (e) {
        throw changeErrorType(e, FormatError);
    }
    const checkFile = ensureFile(folder);
    const result = await readYamlCases(config, checkFile)
        .catch((e) => { throw changeErrorType(e, FormatError); });
    result.count = Object.keys(result.answers || {}).length || Math.sum((result.subtasks || []).map((s) => s.cases.length));
    if (!result.count) {
        try {
            result.subtasks = readSubtasksFromFiles(await collectFiles(folder), cfg);
            result.count = Math.sum(result.subtasks.map((i) => i.cases.length));
            if (args.isSelfSubmission) args.next?.({ message: { message: 'Found {0} testcases.', params: [result.count] } });
        } catch (e) {
            throw new SystemError('Cannot parse testdata.', [e.message, ...(e.params || [])]);
        }
    }
    result.subtasks = normalizeSubtasks(result.subtasks || [], checkFile, config.time, config.memory);
    if (result.key && args.key !== result.key) throw new FormatError('Incorrect secret key');
    if (!result.key) isValidConfig(result);
    return result;
}
