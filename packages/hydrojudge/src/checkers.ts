/* eslint-disable no-template-curly-in-string */
import { STATUS } from '@hydrooj/utils/lib/status';
import { SystemError } from './error';
import { run } from './sandbox';
import { CopyInFile } from './sandbox/interface';
import { parse } from './testlib';

interface CheckConfig {
    input: string,
    output: string,
    user_stdout: string,
    user_stderr: string,
    score: number,
    copyIn: Record<string, CopyInFile>,
    detail: boolean,
}

interface CheckResult {
    status: number,
    score: number,
    message: string,
    code?: number,
}

type Checker = (config: CheckConfig) => Promise<CheckResult>;

const checkers: Record<string, Checker> = {
    async default(config) {
        const { stdout } = await run('/usr/bin/diff -BZ usrout answer', {
            copyIn: {
                usrout: { src: config.user_stdout },
                answer: { src: config.output },
                ...config.copyIn,
            },
        });
        let status: number;
        let message: any = '';
        if (stdout) {
            status = STATUS.STATUS_WRONG_ANSWER;
            if (config.detail) {
                try {
                    const pt = stdout.split('---');
                    const u = pt[0].split('\n')[1];
                    let usr = u.substr(2, u.length - 2).trim().split(' ');
                    const t = pt[1].split('\n')[1];
                    let std = t.substr(2, t.length - 2).trim().split(' ');
                    if (usr.length < std.length) message = 'Standard answer longer than user output.';
                    else if (usr.length > std.length) message = 'User output longer than standard answer.';
                    else {
                        for (const i in usr) {
                            if (usr[i] !== std[i]) {
                                usr = usr[i];
                                std = std[i];
                                break;
                            }
                        }
                        if (usr.length > 20) usr = `${usr.substring(0, 16)}...`;
                        if (std.length > 20) std = `${std.substring(0, 16)}...`;
                        message = { message: 'Read {0}, expect {1}.', params: [usr, std] };
                    }
                } catch (e) {
                    message = stdout.substring(0, stdout.length - 1 <= 30 ? stdout.length - 1 : 30);
                }
            }
        } else status = STATUS.STATUS_ACCEPTED;
        if (message.length > 1024000) message = '';
        return {
            score: status === STATUS.STATUS_ACCEPTED ? config.score : 0,
            status,
            message,
        };
    },

    async strict(config) {
        const { stdout } = await run('/usr/bin/diff usrout answer', {
            copyIn: {
                usrout: { src: config.user_stdout },
                answer: { src: config.output },
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
        const { code, stdout } = await run('${dir}/checker input answer usrout', {
            copyIn: {
                usrout: { src: config.user_stdout },
                answer: { src: config.output },
                input: { src: config.input },
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
        const { files } = await run(`\${dir}/checker input usrout answer ${config.score} score message`, {
            copyIn: {
                usrout: { src: config.user_stdout },
                answer: { src: config.output },
                input: { src: config.input },
                ...config.copyIn,
            },
            copyOut: ['score', 'message'],
        });
        const { message } = files;
        const score = parseInt(files.score, 10);
        return {
            score,
            message,
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
        const { status, stdout } = await run('${dir}/checker input usrout', {
            copyIn: {
                usrout: { src: config.user_stdout },
                input: { src: config.input },
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
        let { status, stdout, stderr } = await run('${dir}/checker', {
            copyIn: {
                input: { src: config.input },
                user_out: { src: config.user_stdout },
                answer: { src: config.output },
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
        const { stderr, status } = await run('${dir}/checker ${dir}/in ${dir}/user_out ${dir}/answer', {
            copyIn: {
                in: { src: config.input },
                user_out: { src: config.user_stdout },
                answer: { src: config.output },
                ...config.copyIn,
            },
        });
        if (status === STATUS.STATUS_SYSTEM_ERROR) {
            return {
                status: STATUS.STATUS_SYSTEM_ERROR,
                score: 0,
                message: stderr,
            };
        }
        return parse(stderr, config.score);
    },
};

export = checkers;
