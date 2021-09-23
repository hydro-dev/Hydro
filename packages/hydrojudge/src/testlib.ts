import { STATUS } from '@hydrooj/utils/lib/status';

export function parse(output: string, fullscore: number) {
    let status = STATUS.STATUS_WRONG_ANSWER;
    let score = 0;
    let message = output.substr(0, 1024);
    if (output.startsWith('ok ')) {
        status = STATUS.STATUS_ACCEPTED;
        score = fullscore;
    } else if (output.startsWith('wrong answer ')) {
        message = output.split('wrong answer ')[1] || '';
    } else if (output.startsWith('wrong output format ')) {
        message = `PE ${output.split('wrong output format ')[1] || ''}`;
    } else if (output.startsWith('partially correct ')) {
        message = `PC ${output.split('partially correct ')[1] || ''}`;
        let p = +output.split('partially correct (')[1].split(')')[0] || 0;
        if (p > 1) p /= 100;
        score = Math.floor(fullscore * p);
    } else if (output.startsWith('points ')) {
        let p = +output.split('points ')[1].split(' ')[0] || 0;
        if (p > 1) p /= 100;
        if (p === 1) {
            status = STATUS.STATUS_ACCEPTED;
            score = fullscore;
            const base = output.split('points ')[1] || '';
            message = base.substr(base.indexOf(' '), 1024);
        } else score = Math.floor(fullscore * p);
    }
    return { status, score, message };
}
