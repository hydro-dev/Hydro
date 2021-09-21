import { load } from 'js-yaml';
import readYamlCases from '@hydrooj/utils/lib/cases';
import type { ProblemConfig, ProblemConfigFile } from '../interface';

export async function parseConfig(config: string | ProblemConfigFile = {}) {
    let cfg: ProblemConfigFile = {};
    if (typeof config === 'string') {
        // TODO should validate here?
        cfg = await readYamlCases(load(config) as Record<string, any>);
    } else if (typeof config === 'object') cfg = await readYamlCases(config);
    const result: ProblemConfig = {
        count: 0,
        memoryMin: Number.MAX_SAFE_INTEGER,
        memoryMax: 0,
        timeMin: Number.MAX_SAFE_INTEGER,
        timeMax: 0,
        type: cfg.type || 'default',
    };
    if (cfg.subType) result.subType = cfg.subType;
    if (cfg.target) result.target = cfg.target;
    if (cfg.subtasks.length) {
        for (const subtask of cfg.subtasks) {
            result.memoryMax = Math.max(result.memoryMax, subtask.memory);
            result.memoryMin = Math.min(result.memoryMin, subtask.memory);
            result.timeMax = Math.max(result.timeMax, subtask.time);
            result.timeMin = Math.min(result.timeMin, subtask.time);
        }
    } else if (cfg.time || cfg.memory) {
        if (cfg.time) result.timeMax = result.timeMin = cfg.time as unknown as number;
        if (cfg.memory) result.memoryMax = result.memoryMin = cfg.memory as unknown as number;
    }
    if (result.memoryMax < result.memoryMin) {
        result.memoryMax = result.memoryMin = 256;
    }
    if (result.timeMax < result.timeMin) {
        result.timeMax = result.timeMin = 1000;
    }
    if (cfg.langs) result.langs = cfg.langs;
    if (cfg.redirect) result.redirect = cfg.redirect.split('/', 2) as any;
    if (cfg.filename && result.type === 'default') {
        result.type = 'fileio';
        result.subType = cfg.filename;
    }
    return result;
}

global.Hydro.lib.testdataConfig = { parseConfig };
