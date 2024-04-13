/* eslint-disable no-template-curly-in-string */
import { STATUS } from '@hydrooj/utils/lib/status';
import { FormatError, SystemError } from './error';
import { CopyInFile, runQueued } from './sandbox';
import { parse } from './testlib';

export interface CheckConfig {
    execute: string;
    input: CopyInFile;
    output: CopyInFile;
    user_stdout: CopyInFile;
    user_stderr: CopyInFile;
    copyIn: Record<string, CopyInFile>;
    score: number;
    detail: boolean;
    env?: Record<string, string>;
}

type Checker = (config: CheckConfig) => Promise<{
    status: number,
    score: number,
    message: string,
}>;

function parseDiffMsg(msg: string) {
    try {
        // Note: we only handle first diff
        const desc = msg.split('\n')[0];
        if (desc.includes('d')) return 'User output longer than standard answer.';
        if (desc.includes('a')) return 'Standard answer longer than user output.';
        const pt = msg.split('---');
        // Get the first different line
        const u = pt[0].split('\n')[1];
        const t = pt[1].split('\n')[1];
        // Split by token
        const usr = u.substring(2).trim().split(' ');
        const std = t.substring(2).trim().split(' ');
        if (std.every((x) => !Number.isNaN(+x))) {
            // Number mode, report length not match
            if (usr.length > std.length) return 'User output longer than standard answer.';
            if (usr.length < std.length) return 'Standard answer longer than user output.';
        }
        for (let i = 0; i < usr.length; i++) {
            if (usr[i] === std[i]) continue;
            const usrString = usr[i].length > 20 ? `${usr[i].substring(0, 16)}...` : usr[i];
            const stdString = std[i].length > 20 ? `${std[i].substring(0, 16)}...` : std[i];
            return { message: 'Read {0}, expect {1}.', params: [usrString, stdString] };
        }
        throw new Error();
    } catch (e) {
        return msg.substring(0, msg.length - 1 <= 30 ? msg.length - 1 : 30);
    }
}

const checkers: Record<string, Checker> = new Proxy({
    async default(config) {
        const { stdout } = await runQueued('/usr/bin/diff -BZ usrout answer', {
            copyIn: {
                usrout: config.user_stdout,
                answer: config.output,
                ...config.copyIn,
            },
        });
        let status: number;
        let message: any = '';
        if (stdout) {
            status = STATUS.STATUS_WRONG_ANSWER;
            if (config.detail) message = parseDiffMsg(stdout);
        } else status = STATUS.STATUS_ACCEPTED;
        if (message.length > 1024000) message = '';
        return {
            score: status === STATUS.STATUS_ACCEPTED ? config.score : 0,
            status,
            message,
        };
    },

    async strict(config) {
        const { stdout } = await runQueued('/usr/bin/diff usrout answer', {
            copyIn: {
                usrout: config.user_stdout,
                answer: config.output,
                ...config.copyIn,
            },
        });
        const status = stdout ? STATUS.STATUS_WRONG_ANSWER : STATUS.STATUS_ACCEPTED;
        return {
            score: status === STATUS.STATUS_ACCEPTED ? config.score : 0,
            status,
            message: '',
        };
    },

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
            message: stdout,
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
            message: files.message,
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
            message: stdout,
        };
    },

    /*
     * input：输入
     * user_out：选手输出
     * answer：标准输出
     * code：选手代码 (not impl)
     * stdout：输出最终得分
     * stderr：输出错误报告
     */
    async syzoj(config) {
        // eslint-disable-next-line prefer-const
        let { status, stdout, stderr } = await runQueued(config.execute, {
            copyIn: {
                input: config.input,
                user_out: config.user_stdout,
                answer: config.output,
                code: { content: '' },
                ...config.copyIn,
            },
        });
        if (status !== STATUS.STATUS_ACCEPTED) throw new SystemError('Checker returned {0}.', [status]);
        const score = +stdout;
        status = score === 100 ? STATUS.STATUS_ACCEPTED : STATUS.STATUS_WRONG_ANSWER;
        return { status, score: Math.floor((score * config.score) / 100), message: stderr };
    },

    async testlib(config) {
        const { stderr, status, code } = await runQueued(`${config.execute} /w/in /w/user_out /w/answer`, {
            copyIn: {
                in: config.input,
                user_out: config.user_stdout,
                answer: config.output,
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
        return parse(stderr, config.score);
    },
}, {
    get(self, key) {
        if (!self[key]) throw new FormatError('Unknown checker type {0}', [key]);
        return self[key];
    },
});

export default checkers;
