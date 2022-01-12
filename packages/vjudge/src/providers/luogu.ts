/* eslint-disable no-await-in-loop */
import { JSDOM } from 'jsdom';
import { flattenDeep } from 'lodash';
import superagent from 'superagent';
import proxy from 'superagent-proxy';
import { STATUS } from '@hydrooj/utils/lib/status';
import { sleep } from '@hydrooj/utils/lib/utils';
import { Logger } from 'hydrooj/src/logger';
import * as setting from 'hydrooj/src/model/setting';
import { IBasicProvider, RemoteAccount } from '../interface';

proxy(superagent);
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
    `Hydro/${require('hydrooj/package.json').version}`,
    `Vjudge/${require('@hydrooj/vjudge/package.json').version}`,
].join(' ');

export default class LuoguProvider implements IBasicProvider {
    constructor(public account: RemoteAccount, private save: (data: any) => Promise<void>) {
        if (account.cookie) this.cookie = account.cookie;
        setInterval(() => this.getCsrfToken('/'), 5 * 60 * 1000);
    }

    cookie: string[] = [];
    csrf: string;

    get(url: string) {
        logger.debug('get', url);
        if (!url.includes('//')) url = `${this.account.endpoint || 'https://www.luogu.com.cn'}${url}`;
        const req = superagent.get(url)
            .set('Cookie', this.cookie)
            .set('User-Agent', UA);
        if (this.account.proxy) return req.proxy(this.account.proxy);
        return req;
    }

    post(url: string) {
        logger.debug('post', url, this.cookie);
        if (!url.includes('//')) url = `${this.account.endpoint || 'https://www.luogu.com.cn'}${url}`;
        const req = superagent.post(url)
            .set('Cookie', this.cookie)
            .set('x-csrf-token', this.csrf)
            .set('User-Agent', UA)
            .set('x-requested-with', 'XMLHttpRequest')
            .set('origin', 'https://www.luogu.com.cn');
        if (this.account.proxy) return req.proxy(this.account.proxy);
        return req;
    }

    async getCsrfToken(url: string) {
        const { text: html } = await this.get(url);
        const $dom = new JSDOM(html);
        this.csrf = $dom.window.document.querySelector('meta[name="csrf-token"]').getAttribute('content');
        logger.info('csrf-token=', this.csrf);
    }

    get loggedIn() {
        return this.get('/user/setting?_contentOnly=1').then(({ body }) => body.currentTemplate !== 'AuthLogin');
    }

    async ensureLogin() {
        if (await this.loggedIn) {
            await this.getCsrfToken('/');
            return true;
        }
        logger.info('retry login');
        // TODO login;
        return false;
    }

    async getProblem(id: string) {
        logger.info(id);
        // TODO
        return {
            title: id,
            data: {},
            files: {},
            tag: [],
            content: '',
        };
    }

    async listProblem() {
        return [];
    }

    async submitProblem(id: string, lang: string, code: string, info) {
        const comment = setting.langs[lang]?.comment;
        if (comment) {
            const msg = `Hydro submission #${info.rid}@${new Date().toLocaleString()}`;
            if (typeof comment === 'string') code = `${comment} ${msg}\n${code}`;
            else if (comment instanceof Array) code = `${comment[0]} ${msg} ${comment[1]}\n${code}`;
        }
        lang = lang.includes('luogu.') ? lang.split('luogu.')[1] : '0';
        const result = await this.post(`/fe/api/problem/submit/${id}${this.account.query || ''}`)
            .set('referer', `https://www.luogu.com.cn/problem/${id}`)
            // TODO O2
            .send({ code, lang: +lang, enableO2: 0 });
        logger.info('RecordID:', result.body.rid);
        return result.body.rid;
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
                const total = flattenDeep(body.currentData.testCaseGroup).length;
                // TODO sorted
                if (!data.detail.judgeResult?.subtasks) continue;
                for (const key in data.detail.judgeResult.subtasks) {
                    const subtask = data.detail.judgeResult.subtasks[key];
                    for (const cid in subtask.testCases || {}) {
                        if (done[`${subtask.id}.${cid}`]) continue;
                        finished++;
                        done[`${subtask.id}.${cid}`] = true;
                        const testcase = subtask.testCases[cid];
                        await next({
                            status: STATUS.STATUS_JUDGING,
                            case: {
                                status: STATUS_MAP[testcase.status],
                                time: testcase.time,
                                memory: testcase.memory,
                                message: testcase.description,
                            },
                            progress: (finished / total) * 100,
                        });
                    }
                }
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
