import assert from 'assert';
import { readFile } from 'fs-extra';
import yaml from 'js-yaml';
import { STATUS } from '@hydrooj/utils/lib/status';
import { Context } from './interface';

export async function judge({
    next, end, config, code,
}: Context) {
    next({ status: STATUS.STATUS_JUDGING, progress: 0 });
    const answer = ('src' in code)
        ? await readFile(code.src, 'utf-8')
        : ('content' in code)
            ? code.content.toString().replace(/\r/g, '')
            : '';
    let answers: { [x: string]: string | string[] } = {};
    try {
        answers = yaml.load(answer) as any;
        assert(typeof answers === 'object');
    } catch (e) {
        return end({
            status: STATUS.STATUS_WRONG_ANSWER,
            score: 0,
            message: 'Unable to parse answer.',
            time: 0,
            memory: 0,
        });
    }
    let totalScore = 0;
    let totalStatus = 0;
    for (const key in config.answers) {
        const [subtaskId, caseId] = key.split('-').map(Number);
        const ansInfo = config.answers[key] as [string | string[], number];
        const score = ansInfo[1];
        const baseInfo = {
            subtaskId,
            id: caseId,
            time: 0,
            memory: 0,
        };
        if (typeof ansInfo[0] === 'string') {
            if (ansInfo[0]?.trim() === (answers[key] as any)?.trim()) {
                totalScore += score;
                totalStatus = Math.max(totalStatus, STATUS.STATUS_ACCEPTED);
                next({
                    status: totalStatus,
                    case: {
                        ...baseInfo,
                        status: STATUS.STATUS_ACCEPTED,
                        score,
                        message: 'Correct',
                    },
                });
            } else {
                totalStatus = STATUS.STATUS_WRONG_ANSWER;
                next({
                    status: totalStatus,
                    case: {
                        ...baseInfo,
                        status: STATUS.STATUS_WRONG_ANSWER,
                        score: 0,
                        message: 'Incorrect',
                    },
                });
            }
        } else if (typeof answers[key] === 'string') {
            const correct = (ansInfo[0] || []).map((i) => i.trim() === (answers[key] as any)?.trim());
            if (new Set(correct).has(true)) {
                totalScore += score;
                totalStatus = Math.max(totalStatus, STATUS.STATUS_ACCEPTED);
                next({
                    status: totalStatus,
                    case: {
                        ...baseInfo,
                        status: STATUS.STATUS_ACCEPTED,
                        score,
                        message: 'Correct',
                    },
                });
            } else {
                totalStatus = STATUS.STATUS_WRONG_ANSWER;
                next({
                    status: totalStatus,
                    case: {
                        ...baseInfo,
                        status: STATUS.STATUS_WRONG_ANSWER,
                        score: 0,
                        message: 'Incorrect',
                    },
                });
            }
        } else {
            const stdAns = new Set(ansInfo[0] || []);
            const ans = new Set(answers[key] || []);
            const correct = stdAns.size === ans.size && [...stdAns].every((x) => ans.has(x));
            const partialCorrect = [...stdAns].some((x) => ans.has(x)) && [...ans].every((x) => stdAns.has(x));
            if (correct) {
                totalScore += score;
                totalStatus = Math.max(totalStatus, STATUS.STATUS_ACCEPTED);
                next({
                    status: totalStatus,
                    case: {
                        ...baseInfo,
                        status: STATUS.STATUS_ACCEPTED,
                        score,
                        message: 'Correct',
                    },
                });
            } else if (partialCorrect) {
                totalScore += Math.floor(score / 2);
                totalStatus = STATUS.STATUS_WRONG_ANSWER;
                next({
                    status: totalStatus,
                    case: {
                        ...baseInfo,
                        status: STATUS.STATUS_WRONG_ANSWER,
                        score: Math.floor(score / 2),
                        message: 'Partially Correct',
                    },
                });
            } else {
                totalStatus = STATUS.STATUS_WRONG_ANSWER;
                next({
                    status: totalStatus,
                    case: {
                        ...baseInfo,
                        status: STATUS.STATUS_WRONG_ANSWER,
                        score: 0,
                        message: 'Incorrect',
                    },
                });
            }
        }
    }
    return end({
        status: totalStatus, score: totalScore, time: 0, memory: 0,
    });
}
