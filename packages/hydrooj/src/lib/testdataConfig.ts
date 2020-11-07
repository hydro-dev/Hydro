import Zip from 'adm-zip';
import { safeLoad } from 'js-yaml';
import { LocalProblemConfig } from '../interface';

export async function readConfig(file: string | Buffer) {
    const data = new Zip(file);
    const entries = data.getEntries();
    for (const entry of entries) {
        if (entry.name.toLowerCase() === 'config.yaml') {
            return entry.getData().toString();
        }
        if (entry.name.toLowerCase() === 'config.ini') {
            const ini = entry.getData().toString();
            const conv = global.Hydro.lib['testdata.convert.ini'];
            return conv(ini);
        }
    }
    return '';
}

interface ParseResult {
    count: number,
    memoryMax: number,
    memoryMin: number,
    timeMax: number,
    timeMin: number,
}

export async function parseConfig(config: string | LocalProblemConfig) {
    const result: ParseResult = {
        count: 0,
        memoryMin: Number.MAX_SAFE_INTEGER,
        memoryMax: 0,
        timeMin: Number.MAX_SAFE_INTEGER,
        timeMax: 0,
    };
    let cfg: LocalProblemConfig = {};
    if (typeof config === 'string') {
        // TODO should validate here?
        cfg = safeLoad(config) as LocalProblemConfig;
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

global.Hydro.lib.testdataConfig = { readConfig, parseConfig };
