import * as STATUS from './status';

export function parse(output: string, fullscore: number) {
    let status = STATUS.STATUS_WRONG_ANSWER;
    let score = 0;
    let message = output;
    if (output.startsWith('ok ')) {
        status = STATUS.STATUS_ACCEPTED;
        score = fullscore;
    } else if (output.startsWith('wrong answer ')) {
        message = output.split('wrong answer ')[1] || '';
    } else if (output.startsWith('wrong output format ')) {
        message = `PE ${output.split('wrong output format ')[1] || ''}`;
    } else if (output.startsWith('partially correct ')) {
        message = `PC ${output.split('partially correct ')[1] || ''}`;
        const p = +output.split('partially correct (')[1].split(')')[0];
        score = Math.floor(fullscore * (p / 200));
    } else if (output.startsWith('points ')) {
        const p = +output.split('points ')[1].split(' ')[0];
        if (p === 100) {
            status = STATUS.STATUS_ACCEPTED;
            score = fullscore;
            const base = output.split('points ')[1] || '';
            message = base.substr(base.indexOf(' '), 1024);
        } else {
            message = `partially correct ${output.split('points ')[1] || ''}`;
            score = Math.floor(fullscore * (p / 100));
        }
    }
    return { status, score, message };
}
