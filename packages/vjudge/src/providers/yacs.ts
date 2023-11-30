/* eslint-disable no-await-in-loop */
import { JSDOM } from 'jsdom';
import {
    Logger, sleep, STATUS, yaml,
} from 'hydrooj';
import { BasicFetcher } from '../fetch';
import { IBasicProvider, RemoteAccount } from '../interface';

const logger = new Logger('remote/yacs');

const StatusMapping: Record<string, STATUS> = {
    正在评测: STATUS.STATUS_JUDGING,
    答案正确: STATUS.STATUS_ACCEPTED,
    编译失败: STATUS.STATUS_COMPILE_ERROR,
    答案错误: STATUS.STATUS_WRONG_ANSWER,
    部分正确: STATUS.STATUS_WRONG_ANSWER,
    运行时错误: STATUS.STATUS_RUNTIME_ERROR,
    运行超时: STATUS.STATUS_TIME_LIMIT_EXCEEDED,
    内存超出: STATUS.STATUS_MEMORY_LIMIT_EXCEEDED,
    暂未公布: STATUS.STATUS_SYSTEM_ERROR,
    评测机故障: STATUS.STATUS_SYSTEM_ERROR,
};

export default class YACSProvider extends BasicFetcher implements IBasicProvider {
    constructor(public account: RemoteAccount, private save: (data: any) => Promise<void>) {
        super(account, 'https://api.iai.sh.cn', 'form', logger);
    }

    async getData(url: string) {
        const { text } = await this.get(new URL(url, 'https://iai.sh.cn').toString());
        const { window: { document } } = new JSDOM(text);
        return JSON.parse(document.querySelector('script#__NEXT_DATA__').innerHTML).props.pageProps;
    }

    token: string;

    get loggedIn(): Promise<boolean> {
        return new Promise((resolve) => {
            this.get('/user/fetchByToken').query({ token: this.token })
                .end((err, { status }) => resolve(status === 200));
        });
    }

    async ensureLogin() {
        if (await this.loggedIn) return true;
        logger.info('retry login');
        try {
            // NOTE: you should pass a pre-hashed key!
            const { body: { token } } = await this.post('/user/login')
                .send({ username: this.account.handle, password: this.account.password });
            this.token = token;
        } catch (e) { }
        return await this.loggedIn;
    }

    async getProblem(id: string) {
        logger.info(id);
        const { problem } = await this.getData(`/problem/${id.split('P')[1]}`);
        const tag = [];
        if (problem.level) tag.push(problem.level);
        if (problem.contest) tag.push(problem.contest.name);
        let content = '';
        if (problem.background.trim()) content += `## 题目背景\n\n${problem.background.trim()}\n\n`;
        content += `## 题目描述\n\n${problem.description.trim()}\n\n`;
        content += `## 输入格式\n\n${problem.inputFormat.trim()}\n\n`;
        content += `## 输出格式\n\n${problem.outputFormat.trim()}\n\n`;
        content += problem.exampleList.map((sample, index) => {
            const sampleId = index + 1;
            let ret = '';
            ret += `\`\`\`input${sampleId}\n${sample.input.trim()}\n\`\`\`\n\n`;
            ret += `\`\`\`output${sampleId}\n${sample.output.trim()}\n\`\`\`\n\n`;
            if (sample.note && sample.note.trim()) ret += `## 样例解释 ${sampleId}\n\n${sample.note.trim()}\n\n`;
            return ret;
        }).join('');
        content += `## 数据范围\n\n${problem.dataRange.trim()}\n\n`;
        if (problem.source.trim()) content += `## 来源\n\n${problem.source.trim()}\n\n`;
        return {
            title: problem.title,
            data: {
                'config.yaml': Buffer.from(yaml.dump({
                    time: `${problem.limitTime}ms`,
                    memory: `${problem.limitMemory}m`,
                    type: 'remote_judge',
                    subType: 'yacs',
                    target: id,
                })),
            },
            files: {},
            tag,
            content,
        };
    }

    async listProblem(page: number, resync = false) {
        if (resync && page > 1) return [];
        const data = await this.getData(`/problem?pi=${page}`);
        return data.problemList
            .filter((problem) => problem.contest.status === '榜单已公布')
            .map((problem) => `P${problem.id}`);
    }

    async submitProblem(id: string, lang: string, code: string, info, next, end) {
        const langs = {
            'yacs.1': 'C++',
            'yacs.2': 'Python 3.6',
        };
        if (!langs[lang]) {
            end({ status: STATUS.STATUS_COMPILE_ERROR, message: `Language not supported: ${lang}` });
            return null;
        }
        const { body } = await this.post('/submission/submit')
            .set('Yacs-Token', this.token)
            .send({
                code,
                language: langs[lang],
                problemId: +id.split('P')[1],
            });
        return `${body.id}`;
    }

    async waitForSubmission(id: string, next, end) {
        const done = {};
        // eslint-disable-next-line no-constant-condition
        while (true) {
            await sleep(3000);
            const { submission } = await this.getData(`/submission/${id}`);
            const status = StatusMapping[submission.finalStatus];
            if (status === STATUS.STATUS_COMPILE_ERROR) {
                return await end({
                    status,
                    compilerText: submission.finalErrorInfo,
                    score: 0,
                    time: 0,
                    memory: 0,
                });
            }
            const cases = [];
            let taskId = 0;
            for (const task of submission.finalTaskList) {
                taskId++;
                let pointId = 0;
                for (const point of (task as any).dataPointList) {
                    pointId++;
                    if (done[`${taskId}.${pointId}`]) continue;
                    if (StatusMapping[point.status] === STATUS.STATUS_JUDGING) continue;
                    done[`${taskId}.${pointId}`] = true;
                    cases.push({
                        id: pointId,
                        subtaskId: taskId,
                        score: point.scoreGet,
                        time: 0,
                        memory: 0,
                        status: StatusMapping[point.status],
                    });
                }
            }
            await next({
                status,
                score: submission.finalScoreGet,
                cases,
            });
            if (status !== STATUS.STATUS_JUDGING) {
                return await end({
                    status,
                    score: submission.finalScoreGet,
                    time: submission.finalTimeUsage,
                    memory: submission.finalMemoryUsage / 1024,
                });
            }
        }
    }
}
