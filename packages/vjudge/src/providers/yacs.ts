/* eslint-disable no-await-in-loop */
import {
    Logger, parseMemoryMB, parseTimeMS, sleep, STATUS, yaml,
} from 'hydrooj';
import { JSDOM } from 'jsdom';
import { BasicFetcher } from '../fetch';
import { IBasicProvider, RemoteAccount } from '../interface';
import crypto from 'crypto-js';

const logger = new Logger('remote/yacs');

const StatusMapping: Record<string, STATUS> = {
    '答案正确': STATUS.STATUS_ACCEPTED,
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
        return new Promise(async (resolve) => {
            await this.get('/user/fetchByToken').query({ token: this.token })
                .end((err, { status }) => resolve(status === 200));
        });
    }

    async ensureLogin() {
        if (await this.loggedIn) return true;
        logger.info('retry login');
        const password = crypto.MD5(this.account.password + 'yacs').toString();
        try {
            const { body: { token } } = await this.post('/user/login')
                .send({ username: this.account.handle, password });
            this.token = token;
        } catch (e) { }
        return await this.loggedIn;
    }

    async getProblem(id: string) {
        logger.info(id);
        const { problem } = await this.getData(`/problem/${id.split('P')[1]}`);
        let tag = [];
        if (problem.level) tag.push(problem.level);
        if (problem.contest) tag.push(problem.contest.name);
        if (problem.type !== '比赛')
            throw new Error(id)
        if (!(problem.contest.name.length > 0))
            throw new Error(id)
        if (problem.inputFileName || problem.outputFileName)
            throw new Error(id)
        let content = '';
        if (problem.background.trim()) content += `## 题目背景\n\n${problem.background.trim()}\n\n`;
        content += `## 题目描述\n\n${problem.description.trim()}\n\n`;
        content += `## 输入格式\n\n${problem.inputFormat.trim()}\n\n`;
        content += `## 输出格式\n\n${problem.outputFormat.trim()}\n\n`;
        content += problem.exampleList.map((sample, index) => {
            const id = index + 1;
            let ret = '';
            ret += `\`\`\`input${id}\n${sample.input.trim()}\n\`\`\`\n\n`;
            ret += `\`\`\`output${id}\n${sample.output.trim()}\n\`\`\`\n\n`;
            if (sample.note && sample.note.trim()) ret += `## 样例解释 ${id}\n\n${sample.note.trim()}\n\n`;
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
        while (true) {
            await sleep(3000);
            const { submission } = await this.getData(`/submission/${id}`);
            console.log(JSON.stringify(submission, null, '  '));
            const status = StatusMapping[submission.finalStatus];
            let cases = submission.finalTaskList
                .map((task, taskId) => task.dataPointList
                    .map((point, pointId) => ({
                        id: pointId + 1,
                        subtaskId: taskId + 1,
                        score: point.scoreGet,
                        time: point.timeUsage,
                        memory: point.memoryUsage / 1024,
                        status: StatusMapping[point.status],
                        // message: string,
                    })))
            console.log(cases)
            await next({
                status,
                score: submission.finalScoreGet,
                time: submission.finalTimeUsage,
                memory: submission.finalMemoryUsage / 1024,
                cases,
            });
            // return await end({
            //     status,
            //     score,
            //     time,
            //     memory,
            // });
        }
    }
}