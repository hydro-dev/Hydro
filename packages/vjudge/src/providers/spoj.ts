/* eslint-disable no-await-in-loop */
import { PassThrough } from 'stream';
import { JSDOM } from 'jsdom';
import superagent from 'superagent';
import proxy from 'superagent-proxy';
import { STATUS } from '@hydrooj/utils/lib/status';
import { parseMemoryMB, sleep } from '@hydrooj/utils/lib/utils';
import { Logger } from 'hydrooj/src/logger';
import * as setting from 'hydrooj/src/model/setting';
import { IBasicProvider, RemoteAccount } from '../interface';

proxy(superagent);
const logger = new Logger('spoj');

const VERDICT = {
    11: STATUS.STATUS_COMPILE_ERROR,
    12: STATUS.STATUS_RUNTIME_ERROR,
    13: STATUS.STATUS_TIME_LIMIT_EXCEEDED,
    14: STATUS.STATUS_WRONG_ANSWER,
    15: STATUS.STATUS_ACCEPTED,
};

export default class SPOJProvider implements IBasicProvider {
    constructor(public account: RemoteAccount, private save: (data: any) => Promise<void>) {
        if (account.cookie) this.cookie = account.cookie;
    }

    cookie: string[] = [];

    get(url: string) {
        logger.debug('get', url);
        if (!url.includes('//')) url = `${this.account.endpoint || 'https://www.spoj.com'}${url}`;
        const req = superagent.get(url).set('Cookie', this.cookie);
        if (this.account.proxy) return req.proxy(this.account.proxy);
        return req;
    }

    post(url: string) {
        logger.debug('post', url, this.cookie);
        if (!url.includes('//')) url = `${this.account.endpoint || 'https://www.spoj.com'}${url}`;
        const req = superagent.post(url).type('form').set('Cookie', this.cookie);
        if (this.account.proxy) return req.proxy(this.account.proxy);
        return req;
    }

    get loggedIn() {
        return this.get('/').then(({ text: html }) => {
            const $dom = new JSDOM(html);
            if ($dom.window.document.querySelectorAll('span.fa.fa-sign-out.fa-fw').length) return true;
            return false;
        });
    }

    async ensureLogin() {
        if (await this.loggedIn) return true;
        logger.info('retry login');
        const res = await this.post('/login/').send({
            next_raw: '/',
            autologin: 1,
            login_user: this.account.handle,
            password: this.account.password,
        });
        const cookie = res.header['set-cookie'];
        if (cookie) {
            await this.save({ cookie });
            this.cookie = cookie;
        }
        if (await this.loggedIn) return true;
        return false;
    }

    async getProblem(id: string) {
        logger.info(id);
        const { text } = await this.get(`/problems/${id}/`);
        const { window: { document } } = new JSDOM(text);
        const files = {};
        document.querySelector('#problem-body').querySelectorAll('img[src]').forEach((ele) => {
            const src = ele.getAttribute('src');
            if (!src.startsWith('http')) return;
            const file = new PassThrough();
            this.get(src).pipe(file);
            const fid = String.random(8);
            files[`${fid}.png`] = file;
            ele.setAttribute('src', `file://${fid}.png`);
        });
        const meta = document.querySelector('#problem-meta').children[1];
        const { text: submit } = await this.get(`/submit/${id}/`);
        const $dom = new JSDOM(submit);
        const langs = Array.from($dom.window.document.querySelector('#lang').querySelectorAll('option'))
            .map((i) => `spoj.${i.getAttribute('value')}`);
        let time = meta.children[2].children[1].innerHTML.trim().toLowerCase();
        if (time.includes('-')) time = time.split('-')[1];
        let memory = meta.children[4].children[1].innerHTML.trim().toLowerCase();
        if (memory.includes('-')) memory = memory.split('-')[1];
        return {
            title: document.querySelector('#problem-name').innerHTML.trim().split(`${id} - `)[1],
            data: {
                'config.yaml': Buffer.from(`time: ${time}
memory: ${memory}
type: remote_judge
subType: spoj
target: ${id}
langs: ${JSON.stringify(langs)}`),
            },
            files,
            tag: Array.from(document.querySelectorAll('[data-tagid]')).map((i) => i.childNodes[0].nodeValue.substr(1, 999)),
            content: document.querySelector('#problem-body').innerHTML.trim(),
        };
    }

    async listProblem(page: number, resync = false) {
        if (resync) return [];
        const res = await this.get(`/problems/classical/sort=0,start=${page * 50 - 50}`);
        const { window: { document } } = new JSDOM(res.text);
        const index = document.querySelector('ul.pagination').querySelector('li.active').children[0].innerHTML.trim();
        if (index !== page.toString()) return [];
        return Array.from(document.querySelectorAll('td[align=left]')).map((i) => i.children[0].getAttribute('href').split('/problems/')[1]);
    }

    async submitProblem(problemcode: string, lang: string, code: string, info, next, end) {
        const comment = setting.langs[lang]?.comment;
        if (comment) {
            const msg = `Hydro submission #${info.rid}@${new Date().getTime()}`;
            if (typeof comment === 'string') code = `${comment} ${msg}\n${code}`;
            else if (comment instanceof Array) code = `${comment[0]} ${msg} ${comment[1]}\n${code}`;
        }
        // TODO check submit time to ensure submission
        const { text } = await this.post('/submit/complete/').send({
            submit: 'Submit!',
            lang: lang.split('spoj.')[1] || '44',
            problemcode,
            file: code,
        });
        if (text.includes('Wrong problem code!')) {
            await next({ message: 'Wrong problem code!' });
            await end({ status: STATUS.STATUS_COMPILE_ERROR });
            return null;
        }
        const { window } = new JSDOM(text);
        return window.document.querySelector('[name="newSubmissionId"]').getAttribute('value');
    }

    async waitForSubmission(id: string, next, end) {
        logger.debug('Waiting for %s', id);
        // eslint-disable-next-line no-constant-condition
        while (true) {
            await sleep(3000);
            const { text } = await this.get(`/status/ns=${id}`);
            if (!text.includes(id)) {
                return await end({
                    status: STATUS.STATUS_ETC,
                    score: 0,
                    time: 0,
                    memory: 0,
                });
            }
            const { window: { document } } = new JSDOM(text);
            if (!document.querySelector(`#statusres_${id}[final='1']`)) continue;
            const status = VERDICT[document.querySelector(`#statusres_${id}`).getAttribute('status')] || STATUS.STATUS_WRONG_ANSWER;
            const timestr = document.querySelector(`#statustime_${id}`).children[0].innerHTML.trim();
            const time = timestr === '-' ? 0 : (+timestr) * 1000;
            const memorystr = document.querySelector(`#statusmem_${id}`).innerHTML.trim().toLowerCase();
            const memory = memorystr === '-' ? 0 : parseMemoryMB(memorystr) * 1024;
            await next({
                message: document.querySelector(`#statusres_${id}`).childNodes[0].nodeValue.trim(),
            });
            return await end({
                status,
                score: status === STATUS.STATUS_ACCEPTED ? 100 : 0,
                time,
                memory,
            });
        }
    }
}
