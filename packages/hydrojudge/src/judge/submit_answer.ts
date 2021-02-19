import { readFile } from 'fs-extra';
import * as STATUS from '../status';

export async function judge({
    next, end, config, code,
}) {
    next({ status: STATUS.STATUS_JUDGING, progress: 0 });
    code = code.replace(/\r/g, '');
    const expected = (await readFile(config.subtasks[0].cases[0].output)).toString().replace(/\r/g, '');
    if (config.subtasks.length === 1) {
        const status = code.trim() === expected.trim() ? STATUS.STATUS_ACCEPTED : STATUS.STATUS_WRONG_ANSWER;
        const score = status === STATUS.STATUS_ACCEPTED ? config.subtasks[0].score : 0;
        next({
            status,
            progress: 100,
            case: {
                status, score, time_ms: 0, memory_kb: 0, message: '',
            },
        });
        return end({
            status, score, time_ms: 0, memory_kb: 0,
        });
    }
    const outputs = code.split('\n');
    let score = 0;
    let totalStatus = 0;
    const lines = expected.split('\n');
    for (const i in config.subtasks) {
        const subtask = config.subtasks[i];
        let status = STATUS.STATUS_WRONG_ANSWER;
        if (lines[i].trim() === outputs[i].trim()) {
            score += subtask.score;
            status = STATUS.STATUS_ACCEPTED;
        }
        totalStatus = Math.max(status, totalStatus);
        next({
            status: totalStatus,
            process: (100 * config.subtasks.length) / (+i + 1),
            case: {
                status, score, time_ms: 0, memory_kb: 0, message: '',
            },
        }, i + 1);
    }
    return end({
        status: totalStatus, score, time_ms: 0, memory_kb: 0,
    });
}
