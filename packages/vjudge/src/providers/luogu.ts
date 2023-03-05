/* eslint-disable no-await-in-loop */
import {
    _, Logger, sleep, STATUS,
} from 'hydrooj';
import { BasicFetcher } from '../fetch';
import { IBasicProvider, RemoteAccount } from '../interface';

const logger = new Logger('remote/luogu');

const STATUS_MAP = [
    STATUS.STATUS_WAITING,
    STATUS.STATUS_JUDGING,
    STATUS.STATUS_COMPILE_ERROR,
    STATUS.STATUS_OUTPUT_LIMIT_EXCEEDED,
    STATUS.STATUS_MEMORY_LIMIT_EXCEEDED,
    STATUS.STATUS_TIME_LIMIT_EXCEEDED,
    STATUS.STATUS_WRONG_ANSWER,
    STATUS.STATUS_RUNTIME_ERROR,
    0,
    0,
    0,
    STATUS.STATUS_SYSTEM_ERROR,
    STATUS.STATUS_ACCEPTED,
    0,
    STATUS.STATUS_WRONG_ANSWER,
];

const UA = [
    `Hydro/${global.Hydro.version.hydrooj}`,
    `Vjudge/${global.Hydro.version.vjudge}`,
].join(' ');

export default class LuoguProvider extends BasicFetcher implements IBasicProvider {
    constructor(public account: RemoteAccount, private save: (data: any) => Promise<void>) {
        super(account, 'https://www.luogu.com.cn', 'json', logger, {
            headers: { 'User-Agent': UA },
            post: {
                headers: {
                    'x-requested-with': 'XMLHttpRequest',
                    origin: 'https://www.luogu.com.cn',
                },
            },
        });
        setInterval(() => {
            this.ensureLogin();
            this.getCsrfToken('/user/setting');
        }, 5 * 60 * 1000);
    }

    async getCsrfToken(url: string) {
        const csrf = (await this.html(url)).document.querySelector('meta[name="csrf-token"]').getAttribute('content');
        logger.info('csrf-token=', csrf);
        // this.fetchOptions.post.headers['x-csrf-token'] = csrf;
    }

    get loggedIn() {
        return this.get('/user/setting?_contentOnly=1').then(({ body }) => body.currentTemplate !== 'AuthLogin');
    }

    async ensureLogin() {
        if (await this.loggedIn) {
            await this.getCsrfToken('/user/setting');
            return true;
        }
        logger.info('retry login');
        const res = await this.post(`/api/auth/userPassLogin${this.account.query || ''}`)
            .set('referer', 'https://www.luogu.com.cn/user/setting')
            .send({
                username: this.account.handle,
                password: this.account.password,
            });
        if (res.headers['set-cookie']) this.setCookie(res.headers['set-cookie']);
        if (await this.loggedIn) {
            await this.getCsrfToken('/user/setting');
            return true;
        }
        return false;
    }

    async getProblem() {
        return null;
    }

    async listProblem() {
        return [];
    }

    async submitProblem(id: string, lang: string, code: string, info, next, end) {
        let enableO2 = 0;
        if (code.length < 10) {
            end({ status: STATUS.STATUS_COMPILE_ERROR, message: 'Code too short' });
            return null;
        }
        if (!lang.startsWith('luogu.')) {
            end({ status: STATUS.STATUS_COMPILE_ERROR, message: `Language not supported: ${lang}` });
            return null;
        }
        if (lang.endsWith('o2')) {
            enableO2 = 1;
            lang = lang.slice(0, -2);
        }
        lang = lang.split('luogu.')[1];
        try {
            const result = await this.post(`/fe/api/problem/submit/${id}${this.account.query || ''}`)
                .set('referer', `https://www.luogu.com.cn/problem/${id}`)
                .send({
                    code,
                    lang: +lang,
                    enableO2,
                });
            logger.info('RecordID:', result.body.rid);
            return result.body.rid;
        } catch (e) {
            let parsed = e;
            if (e.text) {
                try {
                    const message = JSON.parse(e.text).errorMessage;
                    if (!message) throw e;
                    parsed = new Error(message);
                    parsed.stack = e.stack;
                } catch (err) {
                    throw e;
                }
            }
            throw parsed;
        }
    }

    async waitForSubmission(id: string, next, end) {
        const done = {};
        let fail = 0;
        let count = 0;
        let finished = 0;
        next({ progress: 5 });
        while (count < 120 && fail < 5) {
            await sleep(1500);
            count++;
            try {
                const { body } = await this.get(`/record/${id}?_contentOnly=1`);
                const data = body.currentData.record;
                if (data.detail.compileResult && data.detail.compileResult.success === false) {
                    await next({ compilerText: data.detail.compileResult.message });
                    return await end({
                        status: STATUS.STATUS_COMPILE_ERROR, score: 0, time: 0, memory: 0,
                    });
                }
                logger.info('Fetched with length', JSON.stringify(body).length);
                if (!data.detail.judgeResult?.subtasks) continue;
                const total = _.flattenDeep(body.currentData.testCaseGroup).length;
                const cases = [];
                let progress = (finished / total) * 100;
                for (const key in data.detail.judgeResult.subtasks) {
                    const subtask = data.detail.judgeResult.subtasks[key];
                    for (const cid in subtask.testCases || {}) {
                        if (done[`${subtask.id}.${cid}`]) continue;
                        finished++;
                        done[`${subtask.id}.${cid}`] = true;
                        const testcase = subtask.testCases[cid];
                        cases.push({
                            id: +cid || 0,
                            subtaskId: +subtask.id || 0,
                            status: STATUS_MAP[testcase.status],
                            time: testcase.time,
                            memory: testcase.memory,
                            message: testcase.description,
                        });
                        progress = (finished / total) * 100;
                    }
                }
                if (cases.length) await next({ status: STATUS.STATUS_JUDGING, cases, progress });
                if (data.status < 2) continue;
                logger.info('RecordID:', id, 'done');
                // TODO calc total status
                return await end({
                    status: STATUS_MAP[data.status],
                    score: data.score,
                    time: data.time,
                    memory: data.memory,
                });
            } catch (e) {
                logger.error(e);
                fail++;
            }
        }
        return await end({
            status: STATUS.STATUS_SYSTEM_ERROR,
            score: 0,
            time: 0,
            memory: 0,
        });
    }
}
