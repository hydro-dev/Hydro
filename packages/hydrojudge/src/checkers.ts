/* eslint-disable no-template-curly-in-string */
import { STATUS } from 'hydrooj/dist/model/builtin';
import fs from 'fs-extra';
import { run } from './sandbox';
import { SystemError } from './error';

interface CheckResult {
    status: number,
    score: number,
    message: string,
    code?: number,
}

type Checker = (config: any) => Promise<CheckResult>;

const checkers: Record<string, Checker> = {
    async default(config) {
        const { stdout } = await run('/usr/bin/diff -BZ usrout stdout', {
            copyIn: {
                usrout: { src: config.user_stdout },
                stdout: { src: config.output },
            },
        });
        let status;
        let message = '';
        if (stdout) {
            status = STATUS.STATUS_WRONG_ANSWER;
            if (config.detail) {
                try {
                    const pt = stdout.split('---');
                    const u = pt[0].split('\n')[1];
                    let usr = u.substr(2, u.length - 2).trim().split(' ');
                    const t = pt[1].split('\n')[1];
                    let std = t.substr(2, t.length - 2).trim().split(' ');
                    if (usr.length < std.length) message = '标准输出比选手输出长。';
                    else if (usr.length > std.length) message = '选手输出比标准输出长。';
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
                        message = `读取到 ${usr} ，应为 ${std}`;
                    }
                } catch (e) {
                    message = stdout.substring(0, stdout.length - 1 <= 30 ? stdout.length - 1 : 30);
                }
            }
        } else status = STATUS.STATUS_ACCEPTED;
        return {
            score: status === STATUS.STATUS_ACCEPTED ? config.score : 0,
            status,
            message,
        };
    },

    /*
     * argv[1]：输入
     * argv[2]：标准输出
     * argv[3]：选手输出
     * exit code：返回判断结果
     */
    async hustoj(config) {
        const { code, stdout } = await run('${dir}/checker input stdout usrout', {
            copyIn: {
                usrout: { src: config.user_stdout },
                stdout: { src: config.output },
                input: { src: config.input },
            },
        });
        const status = code ? STATUS.STATUS_WRONG_ANSWER : STATUS.STATUS_ACCEPTED;
        const message = (await fs.readFile(stdout)).toString();
        return {
            status,
            score: status === STATUS.STATUS_ACCEPTED ? config.score : 0,
            message,
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
        const { files } = await run(`\${dir}/checker input usrout stdout ${config.score} score message`, {
            copyIn: {
                usrout: { src: config.user_stdout },
                stdout: { src: config.output },
                input: { src: config.input },
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
     * in：输入
     * user_out：选手输出
     * answer：标准输出
     * code：选手代码
     * stdout：输出最终得分
     * stderr：输出错误报告
     */
    async syzoj(config) {
        // eslint-disable-next-line prefer-const
        let { status, stdout, stderr } = await run('${dir}/checker', {
            copyIn: {
                in: { src: config.input },
                user_out: { src: config.user_stdout },
                answer: { src: config.output },
                code: { content: config.code },
            },
        });
        if (status !== STATUS.STATUS_ACCEPTED) throw new SystemError('Checker returned a non-zero value', [status]);
        const score = parseInt(stdout, 10);
        status = score === config.score ? STATUS.STATUS_ACCEPTED : STATUS.STATUS_WRONG_ANSWER;
        return { status, score, message: stderr };
    },

    async testlib(config) {
        const { stdout, stderr } = await run('${dir}/checker ${dir}/in ${dir}/user_out ${dir}/answer', {
            copyIn: {
                in: { src: config.input },
                user_out: { src: config.user_stdout },
                answer: { src: config.output },
            },
        });
        return {
            status: stderr === 'ok \n' ? STATUS.STATUS_ACCEPTED : STATUS.STATUS_WRONG_ANSWER,
            score: stderr === 'ok \n' ? config.score : 0,
            message: stdout,
        };
    },
};

export = checkers;
