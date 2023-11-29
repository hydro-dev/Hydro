/* eslint-disable no-await-in-loop */
import {
    Logger, parseMemoryMB, parseTimeMS, sleep, STATUS, yaml,
} from 'hydrooj';
import { JSDOM } from 'jsdom';
import { BasicFetcher } from '../fetch';
import { IBasicProvider, RemoteAccount } from '../interface';
import crypto from 'crypto-js';

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
        let tag = []
        if (problem.level) tag.push(problem.level);
        if (problem.contest) tag.push(problem.contest.name);
        if (problem.type !== '比赛')
            throw new Error(id)
        if (!(problem.contest.name.length > 0))
            throw new Error(id)
        if (problem.source) {
            console.log(problem.source)
            throw new Error(id)
        }
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
            tag: [],
            content,
        };
    }

    async listProblem(page: number, resync = false) {
        if (resync && page > 1) return [];
        const data = await this.getData(`/problem?pi=${page}`);
        return data.problemList.map((problem) => `P${problem.id}`);
    }

    async submitProblem(id: string, lang: string, code: string) {
        console.log(lang)
        // await this.post('/submission/submit')
        //     .send({
        //         code,
        //         language: lang,
        //         problemId: +id.split('P')[1],
        //     })
        return '';
    }

    async waitForSubmission(id: string, next, end) {
    }
}