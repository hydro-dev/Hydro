import { parseMemoryMB, parseTimeMS } from './utils';

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
    if (cfg.checker) config.checker = checkFile(cfg.checker, 'Cannot find checker {0}.');
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
    if ((config.type === 'objective' || cfg.type === 'submit_answer') && !cfg.outputs?.length) throw new Error('outputs config not found');
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
