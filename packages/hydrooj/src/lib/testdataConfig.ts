import readYamlCases from '@hydrooj/utils/lib/cases';
import { load } from 'js-yaml';
import type { ProblemConfig } from '../interface';

interface ParseResult {
    count: number,
    memoryMax: number,
    memoryMin: number,
    timeMax: number,
    timeMin: number,
}

export async function parseConfig(config: string | ProblemConfig) {
    const result: ParseResult = {
        count: 0,
        memoryMin: Number.MAX_SAFE_INTEGER,
        memoryMax: 0,
        timeMin: Number.MAX_SAFE_INTEGER,
        timeMax: 0,
    };
    let cfg: ProblemConfig = {};
    if (typeof config === 'string') {
        // TODO should validate here?
        cfg = readYamlCases(load(config) as Record<string, any>) as ProblemConfig;
    } else cfg = config;
    if (cfg.cases) {
        for (const c of cfg.cases) {
            result.memoryMax = Math.max(result.memoryMax, c.memory);
            result.memoryMin = Math.min(result.memoryMin, c.memory);
            result.timeMax = Math.max(result.timeMax, c.time);
            result.timeMin = Math.min(result.timeMin, c.time);
            result.count++;
        }
    } else if (cfg.subtasks) {
        for (const subtask of cfg.subtasks) {
            result.memoryMax = Math.max(result.memoryMax, subtask.memory);
            result.memoryMin = Math.min(result.memoryMin, subtask.memory);
            result.timeMax = Math.max(result.timeMax, subtask.time);
            result.timeMin = Math.min(result.timeMin, subtask.time);
        }
    }
}

global.Hydro.lib.testdataConfig = { parseConfig };
