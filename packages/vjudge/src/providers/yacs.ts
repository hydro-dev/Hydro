/* eslint-disable no-await-in-loop */
import { JSDOM } from 'jsdom';
import {
    Logger, md5, sleep, STATUS, yaml,
} from 'hydrooj';
import { BasicFetcher } from '../fetch';
import { IBasicProvider, RemoteAccount } from '../interface';
import { VERDICT } from '../verdict';

const logger = new Logger('remote/yacs');

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
            this.get('/user/fetchByToken').query({ token: this.token }).ok(() => true)
                .then((res) => resolve(res.status === 200))
                .catch(() => resolve(false));
        });
    }

    async ensureLogin() {
        if (await this.loggedIn) return true;
        logger.info('retry login');
        try {
            const { body: { token } } = await this.post('/user/login')
                .send({
                    username: this.account.handle,
                    password: /^[a-f0-9]{32}$/.test(this.account.password)
                        ? this.account.password
                        : md5(`${this.account.password}yacs`),
                });
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

    async listProblem(page: number) {
        const data = await this.getData(`/problem?pi=${page}`);
        return data.problemList
            .filter((problem) => problem.contest.status === '榜单已公布')
            .map((problem) => `P${problem.id}`);
    }

    async submitProblem(id: string, lang: string, code: string, info, next, end) {
        if (!['C++', 'Python 3.6'].includes(lang)) {
            end({ status: STATUS.STATUS_COMPILE_ERROR, message: `Language not supported: ${lang}` });
            return null;
        }
        const { body } = await this.post('/submission/submit')
            .set('Yacs-Token', this.token)
            .send({
                code,
                language: lang,
                problemId: +id.split('P')[1],
            });
        return `${body.id}`;
    }

    async waitForSubmission(id: string, next, end) {
        const done = {};
        while (true) {
            await sleep(3000);
            const { submission } = await this.getData(`/submission/${id}`);
            const status = VERDICT[submission.finalStatus];
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
                    if (VERDICT[point.status] === STATUS.STATUS_JUDGING) continue;
                    done[`${taskId}.${pointId}`] = true;
                    cases.push({
                        id: pointId,
                        subtaskId: taskId,
                        score: point.scoreGet,
                        time: 0,
                        memory: 0,
                        status: VERDICT[point.status],
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
