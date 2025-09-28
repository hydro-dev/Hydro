import { DetailType, STATUS } from '@hydrooj/common';
import { FormatError, SystemError } from './error';
import { CopyInFile, runQueued } from './sandbox';
import { parse } from './testlib';

export interface CheckConfig {
    execute: string;
    input: CopyInFile;
    output: CopyInFile;
    user_stdout: CopyInFile;
    user_stderr: CopyInFile;
    code: CopyInFile;
    copyIn: Record<string, CopyInFile>;
    score: number;
    detail: DetailType;
    env?: Record<string, string>;
}

type Checker = (config: CheckConfig) => Promise<{
    status: number;
    score: number;
    message: string;
}>;

function parseDiffMsg(msg: string) {
    msg = msg.trim();
    try {
        if (!msg) return '';
        if (!msg.startsWith('L=')) throw new Error();
        const [meta, u, t] = msg.split('\n');
        const lline = meta.split('L=')[1];
        if (lline?.trim() === 'EOF') {
            const next = u.split('EOF on ')[1].split(' ')[0];
            if (next === 'usrout.processed') return 'Standard answer longer than user output.';
            if (next === 'answer.processed') return 'User output longer than standard answer.';
            return `Unable to parse: ${u}`;
        }
        const lineNum = +lline;
        // Split by token
        const usr = u.trim().split(' ');
        const std = t.trim().split(' ');
        if (std.every((x) => !Number.isNaN(+x))) {
            // Number mode, report length not match
            if (usr.length > std.length) return 'User output longer than standard answer.';
            if (usr.length < std.length) return 'Standard answer longer than user output.';
        }
        for (let i = 0; i < usr.length; i++) {
            if (usr[i] === std[i]) continue;
            const usrString = usr[i].length > 20 ? `${usr[i].substring(0, 16)}...` : usr[i];
            const stdString = std[i].length > 20 ? `${std[i].substring(0, 16)}...` : std[i];
            return { message: 'On line {0}: Read {1}, expect {2}.', params: [lineNum, usrString, stdString] };
        }
        throw new Error();
    } catch (e) {
        return msg.substring(0, msg.length - 1 <= 30 ? msg.length - 1 : 30);
    }
}

const compareSh = `#!/bin/bash
set -e
process_file() {
  cat $1 | awk '
    /^$/{n=n RS};
    /./{
      printf "%s",n; n="";
      for (i=length; i>0; i--) {
        c = substr($0, i, 1);
        if (c != " " && c != "\\t" && c != "\\r") break
      }
      if (i == 0) print ""
      else print substr($0, 1, i);
    }' >$2
}
if [ "$1" = "BZ" ]; then
  process_file usrout usrout.processed
  process_file answer answer.processed
else
  cat usrout | awk '{sub(/\\r+$/, ""); print $0;}' >usrout.processed
  cat answer | awk '{sub(/\\r+$/, ""); print $0;}' >answer.processed
fi
usrsize=$(wc -c < usrout.processed)
stdsize=$(wc -c < answer.processed)
if [ "$usrsize" -gt "$stdsize" ]; then
  echo " (EOF)${' '.repeat(64)}" >>answer.processed
elif [ "$usrsize" -lt "$stdsize" ]; then
  echo " (EOF)${' '.repeat(64)}" >>usrout.processed
fi
result=$(cmp usrout.processed answer.processed || true)
linenum=$(echo "$result" | awk '{print $NF}')
if [ -n "$linenum" ]; then
  echo "L=$linenum"
  awk "NR==$linenum" usrout.processed
  awk "NR==$linenum" answer.processed
elif [ -n "$result" ]; then
  # cmp: EOF on [filename] which is empty
  echo "L=EOF"
  echo "$result"
fi
`;

const getDefaultChecker = (strict: boolean) => async (config: CheckConfig) => {
    const { code, stdout } = await runQueued(`/bin/bash compare.sh${strict ? '' : ' BZ'}`, {
        copyIn: {
            usrout: config.user_stdout,
            answer: config.output,
            ...config.copyIn,
            'compare.sh': { content: compareSh },
        },
        processLimit: 32,
    });
    let status: number;
    let message: any = '';
    if (code) {
        status = STATUS.STATUS_SYSTEM_ERROR;
        message = `Checker returned with status ${code}`;
    } else if (stdout) {
        status = STATUS.STATUS_WRONG_ANSWER;
        if (config.detail === 'full') message = parseDiffMsg(stdout);
    } else status = STATUS.STATUS_ACCEPTED;
    if (message.length > 1024000) message = '';
    return {
        score: status === STATUS.STATUS_ACCEPTED ? config.score : 0,
        status,
        message,
    };
};

const checkers: Record<string, Checker> = new Proxy({
    default: getDefaultChecker(false),
    strict: getDefaultChecker(true),

    /*
     * argv[1]：输入
     * argv[2]：标准输出
     * argv[3]：选手输出
     * exit code：返回判断结果
     */
    async hustoj(config) {
        const { code, stdout } = await runQueued(`${config.execute} input answer usrout`, {
            copyIn: {
                usrout: config.user_stdout,
                answer: config.output,
                input: config.input,
                ...config.copyIn,
            },
        });
        const status = code ? STATUS.STATUS_WRONG_ANSWER : STATUS.STATUS_ACCEPTED;
        return {
            status,
            score: status === STATUS.STATUS_ACCEPTED ? config.score : 0,
            message: config.detail === 'full' ? stdout : '',
        };
    },

    /*
     * argv[1]：输入文件
     * argv[2]：选手输出文件
     * argv[3]：标准输出文件
     * argv[4]：单个测试点分值
     * argv[5]：输出最终得分的文件
     * argv[6]：输出错误报告的文件
     */
    async lemon(config) {
        const { files, code } = await runQueued(`${config.execute} input usrout answer ${config.score} score message`, {
            copyIn: {
                usrout: config.user_stdout,
                answer: config.output,
                input: config.input,
                ...config.copyIn,
            },
            copyOut: ['score?', 'message?'],
            env: config.env,
        });
        if (code) {
            return {
                score: 0,
                message: `Checker returned with status ${code}`,
                status: STATUS.STATUS_SYSTEM_ERROR,
            };
        }
        const score = Math.floor(+files.score) || 0;
        return {
            score,
            message: config.detail === 'full' ? files.message : '',
            status: score === config.score
                ? STATUS.STATUS_ACCEPTED
                : STATUS.STATUS_WRONG_ANSWER,
        };
    },

    /*
     * argv[1]：输入
     * argv[2]：选手输出
     * exit code：返回判断结果
     */
    async qduoj(config) {
        const { status, stdout } = await runQueued(`${config.execute} input usrout`, {
            copyIn: {
                usrout: config.user_stdout,
                input: config.input,
                ...config.copyIn,
            },
        });
        const st = (status === STATUS.STATUS_ACCEPTED)
            ? STATUS.STATUS_ACCEPTED : STATUS.STATUS_WRONG_ANSWER;
        return {
            status: st,
            score: (status === STATUS.STATUS_ACCEPTED) ? config.score : 0,
            message: config.detail === 'full' ? stdout : '',
        };
    },

    /*
     * input：输入
     * user_out：选手输出
     * answer：标准输出
     * code：选手代码
     * stdout：输出最终得分
     * stderr：输出错误报告
     */
    async syzoj(config) {
        let { status, stdout, stderr } = await runQueued(config.execute, {
            copyIn: {
                input: config.input,
                user_out: config.user_stdout,
                answer: config.output,
                code: config.code,
                ...config.copyIn,
            },
        });
        if (status !== STATUS.STATUS_ACCEPTED) throw new SystemError('Checker returned {0}.', [status]);
        const score = +stdout;
        status = score === 100 ? STATUS.STATUS_ACCEPTED : STATUS.STATUS_WRONG_ANSWER;
        return { status, score: Math.floor((score * config.score) / 100), message: config.detail === 'full' ? stderr : '' };
    },

    async testlib(config) {
        const { stderr, status, code } = await runQueued(`${config.execute} /w/in /w/user_out /w/answer`, {
            copyIn: {
                in: config.input,
                user_out: config.user_stdout,
                answer: config.output,
                user_code: config.code,
                ...config.copyIn,
            },
            env: config.env,
        });
        if ([STATUS.STATUS_SYSTEM_ERROR, STATUS.STATUS_TIME_LIMIT_EXCEEDED, STATUS.STATUS_MEMORY_LIMIT_EXCEEDED].includes(status)) {
            const message = {
                [STATUS.STATUS_SYSTEM_ERROR]: stderr,
                [STATUS.STATUS_TIME_LIMIT_EXCEEDED]: 'Checker Time Limit Exceeded',
                [STATUS.STATUS_MEMORY_LIMIT_EXCEEDED]: 'Checker Memory Limit Exceeded',
            }[status];
            return {
                status: STATUS.STATUS_SYSTEM_ERROR,
                score: 0,
                message,
            };
        }
        if (status === STATUS.STATUS_RUNTIME_ERROR && !stderr?.trim()) {
            return {
                status: STATUS.STATUS_SYSTEM_ERROR,
                score: 0,
                message: `Checker exited with code ${code}`,
            };
        }
        return parse(stderr, config.score, config.detail);
    },

    // https://www.kattis.com/problem-package-format/spec/2023-07-draft.html#output-validator
    async kattis(config) {
        const { files, code } = await runQueued(`${config.execute} input answer_file feedback_dir`, {
            copyIn: {
                input: config.input,
                answer_file: config.output,
                'feedback_dir/placeholder': { content: '' },
                ...config.copyIn,
            },
            stdin: config.user_stdout,
            copyOut: [
                'feedback_dir/score.txt?',
                'feedback_dir/judgemessage.txt?',
                'feedback_dir/teammessage.txt?',
                'feedback_dir/judgeerror.txt?',
            ],
        });

        const status = code === 42
            ? STATUS.STATUS_ACCEPTED
            : code === 43
                ? STATUS.STATUS_WRONG_ANSWER
                : STATUS.STATUS_SYSTEM_ERROR;

        const score = status === STATUS.STATUS_ACCEPTED
            ? config.score
            : +files['feedback_dir/score.txt'] || 0;

        const message = status === STATUS.STATUS_SYSTEM_ERROR
            ? files['feedback_dir/judgeerror.txt'] || `Checker exited with code ${code}`
            : config.detail === 'full'
                ? files['feedback_dir/teammessage.txt'] || files['feedback_dir/judgemessage.txt'] || ''
                : '';

        return { status, score, message };
    },
}, {
    get(self, key) {
        if (!self[key]) throw new FormatError('Unknown checker type {0}', [key]);
        return self[key];
    },
});

export default checkers;
