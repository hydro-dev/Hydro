import * as STATUS from './status';

export function parse(output: string, fullscore: number) {
    let status = STATUS.STATUS_WRONG_ANSWER;
    let score = 0;
    let message = '';
    if (output.startsWith('ok ')) status = STATUS.STATUS_ACCEPTED;
    else if (output.startsWith('wrong answer ')) {
        message = output.split('wrong answer ')[1] || '';
        score = fullscore;
    } else if (output.startsWith('wrong output format ')) {
        message = `PE ${output.split('wrong output format ')[1] || ''}`;
    } else if (output.startsWith('unexpected eof ')) {
        message = `UE ${output.split('unexpected eof ')[1] || ''}`;
    } else if (output.startsWith('partially correct ')) {
        message = `PC ${output.split('partially correct ')[1] || ''}`;
        const p = +output.split('partially correct (')[1].split(')')[0];
        score = Math.floor(fullscore * (p / 200));
    } else if (output.startsWith('FAIL ')) {
        message = output.split('FAIL ')[1] || '';
        status = STATUS.STATUS_SYSTEM_ERROR;
    }
    return { status, score, message };
}
