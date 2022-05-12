import path from 'path';
import fs from 'fs-extra';
import yaml from 'js-yaml';
import { max, sum } from 'lodash';
import readYamlCases, { convertIniConfig } from '@hydrooj/utils/lib/cases';
import { normalizeSubtasks, readSubtasksFromFiles } from '@hydrooj/utils/lib/common';
import { changeErrorType } from '@hydrooj/utils/lib/utils';
import { getConfig } from './config';
import { FormatError, SystemError } from './error';
import { ensureFile, parseMemoryMB } from './utils';

function isValidConfig(config) {
    if (config.count > (getConfig('testcases_max') || 100)) {
        throw new FormatError('Too many testcases. Cancelled.');
    }
    const time = sum(config.subtasks.map((subtask) => sum(subtask.cases.map((c) => c.time))));
    if (time > (getConfig('total_time_limit') || 60) * 1000) {
        throw new FormatError('Total time limit longer than {0}s. Cancelled.', [+getConfig('total_time_limit') || 60]);
    }
    const memMax = max(config.subtasks.map((subtask) => max(subtask.cases.map((c) => c.memory))));
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

export default async function readCases(folder: string, cfg: Record<string, any> = {}, args) {
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
            Object.assign(config, yaml.load(fs.readFileSync(yamlConfig).toString()));
        } else if (fs.existsSync(ymlConfig)) {
            Object.assign(config, yaml.load(fs.readFileSync(ymlConfig).toString()));
        } else if (fs.existsSync(iniConfig)) {
            Object.assign(config, convertIniConfig(fs.readFileSync(iniConfig).toString()));
        }
    } catch (e) {
        throw changeErrorType(e, FormatError);
    }
    const checkFile = ensureFile(folder);
    const result = await readYamlCases(config, checkFile)
        .catch((e) => { throw changeErrorType(e, FormatError); });
    result.count = result.outputs?.length || Math.sum((result.subtasks || []).map((s) => s.cases.length));
    if (!result.count) {
        try {
            result.subtasks = readSubtasksFromFiles(await collectFiles(folder), cfg);
            result.count = Math.sum(result.subtasks.map((i) => i.cases.length));
            if (cfg.isSelfSubmission) args.next?.({ message: { message: 'Found {0} testcases.', params: [result.count] } });
        } catch (e) {
            throw new SystemError('Cannot parse testdata.', [e.message, ...e.params]);
        }
    }
    result.subtasks = normalizeSubtasks(result.subtasks || [], checkFile, config.time, config.memory);
    if (result.key && args.key !== result.key) throw new FormatError('Incorrect secret key');
    if (!result.key) isValidConfig(result);
    return result;
}
