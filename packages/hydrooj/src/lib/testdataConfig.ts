import { load } from 'js-yaml';
import readYamlCases from '@hydrooj/utils/lib/cases';
import type { ProblemConfig, ProblemConfigFile } from '../interface';
import { normalizeSubtasks, parseMemoryMB, parseTimeMS } from '../utils';

export async function parseConfig(config: string | ProblemConfigFile = {}) {
    const cfg: ProblemConfigFile = typeof config === 'string'
        ? await readYamlCases(load(config) as Record<string, any>)
        : await readYamlCases(config);
    const result: ProblemConfig = {
        count: 0,
        memoryMin: Number.MAX_SAFE_INTEGER,
        memoryMax: 0,
        timeMin: Number.MAX_SAFE_INTEGER,
        timeMax: 0,
        type: cfg.type || 'default',
        hackable: cfg.validator && cfg.checker && !['default', 'strict'].includes(cfg.checker_type),
    };
    if (cfg.subType) result.subType = cfg.subType;
    if (cfg.target) result.target = cfg.target;
    if (cfg.subtasks?.length) {
        for (const subtask of normalizeSubtasks(cfg.subtasks as any || [], (i) => i, cfg.time, cfg.memory)) {
            result.memoryMax = Math.max(result.memoryMax, ...subtask.cases.map((i) => parseMemoryMB(i.memory)));
            result.memoryMin = Math.min(result.memoryMin, ...subtask.cases.map((i) => parseMemoryMB(i.memory)));
            result.timeMax = Math.max(result.timeMax, ...subtask.cases.map((i) => parseTimeMS(i.time)));
            result.timeMin = Math.min(result.timeMin, ...subtask.cases.map((i) => parseTimeMS(i.time)));
        }
    } else {
        if (cfg.time) result.timeMax = result.timeMin = cfg.time as unknown as number;
        if (cfg.memory) result.memoryMax = result.memoryMin = cfg.memory as unknown as number;
    }
    if (result.memoryMax < result.memoryMin) result.memoryMax = result.memoryMin = 256;
    if (result.timeMax < result.timeMin) result.timeMax = result.timeMin = 1000;
    if (cfg.langs) result.langs = cfg.langs;
    if (cfg.redirect) result.redirect = cfg.redirect.split('/', 2) as any;
    if (cfg.filename && result.type === 'default') result.subType = cfg.filename;
    return result;
}

global.Hydro.lib.testdataConfig = { parseConfig };
