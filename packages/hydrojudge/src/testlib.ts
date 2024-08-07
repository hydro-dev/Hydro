import { STATUS } from '@hydrooj/utils/lib/status';

const operation = /^\s*(status|score)\((\d+)\)\s*(.*)$/m;

export function parse(output: string, fullScore: number) {
    let status = STATUS.STATUS_WRONG_ANSWER;
    let scaledScore = 0;
    let exactScore : number | null = null;
    let builder = (msg: string) => msg;
    let message = `${output.substring(0, 1024)} `;
    if (output.startsWith('ok ')) {
        status = STATUS.STATUS_ACCEPTED;
        scaledScore = 1;
    } else if (output.startsWith('wrong answer ')) {
        message = output.split('wrong answer ')[1] || '';
    } else if (output.startsWith('wrong output format ')) {
        message = output.split('wrong output format ')[1] || '';
        builder = (msg) => `PE ${msg}`;
    } else if (output.startsWith('partially correct ')) {
        let p = +output.split('partially correct (')[1].split(')')[0] || 0;
        if (p > 1) p /= 100;
        scaledScore = p;
        const res = message.split(')');
        res.shift();
        message = res.join(')').trim();
        builder = (msg) => `PC ${msg}`;
    } else if (output.startsWith('points ')) {
        let p = +output.split('points ')[1].split(' ')[0] || 0;
        if (p > 1) p /= 100;
        if (p === 1) {
            status = STATUS.STATUS_ACCEPTED;
            scaledScore = 1;
            message = output.replace(/^points [\d.]+ /, '') || '';
        } else {
            scaledScore = p;
        }
    }
    while (operation.test(message)) {
        const [, op, val, rest] = message.match(operation);
        message = rest;
        if (op === 'status') {
            const s = +val;
            if ([
                STATUS.STATUS_ACCEPTED,
                STATUS.STATUS_WRONG_ANSWER,
                STATUS.STATUS_COMPILE_ERROR,
                STATUS.STATUS_RUNTIME_ERROR,
                STATUS.STATUS_MEMORY_LIMIT_EXCEEDED,
                STATUS.STATUS_TIME_LIMIT_EXCEEDED,
                STATUS.STATUS_OUTPUT_LIMIT_EXCEEDED,
                STATUS.STATUS_FORMAT_ERROR,
            ].includes(s)) status = +val;
        } else if (op === 'score') {
            exactScore = +val;
        }
    }
    if (exactScore !== null) {
        return {
            status, score: exactScore, scaledScore: exactScore / fullScore, message: builder(message),
        };
    }
    return {
        status, score: scaledScore * fullScore, scaledScore, message: builder(message),
    };
}
