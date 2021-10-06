/* eslint-disable no-await-in-loop */
import { PassThrough } from 'stream';
import { JSDOM } from 'jsdom';
import * as superagent from 'superagent';
import proxy from 'superagent-proxy';
import { STATUS } from '@hydrooj/utils/lib/status';
import { parseMemoryMB, parseTimeMS, sleep } from '@hydrooj/utils/lib/utils';
import { Logger } from 'hydrooj/src/logger';
import * as setting from 'hydrooj/src/model/setting';
import { IBasicProvider, RemoteAccount } from '../interface';

proxy(superagent as any);
const logger = new Logger('remote/uoj');
const MAPPING = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
};

const VERDICT = {
    RUNTIME_ERROR: STATUS.STATUS_RUNTIME_ERROR,
    WRONG_ANSWER: STATUS.STATUS_WRONG_ANSWER,
    OK: STATUS.STATUS_ACCEPTED,
    TIME_LIMIT_EXCEEDED: STATUS.STATUS_TIME_LIMIT_EXCEEDED,
    MEMORY_LIMIT_EXCEEDED: STATUS.STATUS_MEMORY_LIMIT_EXCEEDED,
    IDLENESS_LIMIT_EXCEEDED: STATUS.STATUS_TIME_LIMIT_EXCEEDED,
    ACCEPTED: STATUS.STATUS_ACCEPTED,
    'WRONG ANSWER': STATUS.STATUS_WRONG_ANSWER,
    'RUNTIME ERROR': STATUS.STATUS_RUNTIME_ERROR,
    'TIME LIMIT EXCEEDED': STATUS.STATUS_TIME_LIMIT_EXCEEDED,
    'MEMORY LIMIT EXCEEDED': STATUS.STATUS_MEMORY_LIMIT_EXCEEDED,
    'IDLENESS LIMIT EXCEEDED': STATUS.STATUS_TIME_LIMIT_EXCEEDED,
    'EXTRA TEST PASSED': STATUS.STATUS_ACCEPTED,
};

export default class UOJProvider implements IBasicProvider {
    constructor(public account: RemoteAccount, private save: (data: any) => Promise<void>) {
        if (account.cookie) this.cookie = account.cookie;
    }

    cookie: string[] = [];
    csrf: string;

    get(url: string) {
        logger.debug('get', url);
        if (!url.includes('//')) url = `${this.account.endpoint || 'https://uoj.ac'}${url}`;
        const req = superagent.get(url).set('Cookie', this.cookie);
        if (this.account.proxy) return req.proxy(this.account.proxy);
        return req;
    }

    post(url: string) {
        logger.debug('post', url, this.cookie);
        if (!url.includes('//')) url = `${this.account.endpoint || 'https://uoj.ac'}${url}`;
        const req = superagent.post(url).set('Cookie', this.cookie).type('form');
        if (this.account.proxy) return req.proxy(this.account.proxy);
        return req;
    }

    async getCsrfToken(url: string) {
        const { text: html, header } = await this.get(url);
        if (header['set-cookie']) {
            await this.save({ cookie: header['set-cookie'] });
            this.cookie = header['set-cookie'];
        }
        let value = /_token *: *"(.+?)"/g.exec(html);
        if (value) return value?.[1];
        value = /_token" value="(.+?)"/g.exec(html);
        return value?.[1];
    }

    get loggedIn() {
        return this.get('/login').then(({ text: html }) => !html.includes('<title>登录 - Universal Online Judge</title>'));
    }

    async ensureLogin() {
        if (await this.loggedIn) return true;
        logger.info('retry login');
        const _token = await this.getCsrfToken('/login');
        const { header, text } = await this.post('/login')
            .send({
                _token,
                login: '',
                username: this.account.handle,
                // NOTE: you should pass a pre-hashed key!
                password: this.account.password,
            });
        if (header['set-cookie'] && this.cookie.length === 1) {
            header['set-cookie'].push(...this.cookie);
            await this.save({ cookie: header['set-cookie'] });
            this.cookie = header['set-cookie'];
        }
        if (text === 'ok') return true;
        return text;
    }

    async getProblem(id: string) {
        logger.info(id);
        const res = await this.get(`/problem/${id.split('P')[1]}`);
        const { window: { document } } = new JSDOM(res.text);
        const files = {};
        document.querySelectorAll('article>img[src]').forEach((ele) => {
            const src = ele.getAttribute('src');
            if (!src.startsWith('http')) return;
            const file = new PassThrough();
            this.get(src).pipe(file);
            const fid = String.random(8);
            files[`${fid}.png`] = file;
            ele.setAttribute('src', `file://${fid}.png`);
        });
        const contentNode = document.querySelector('article');
        const titles = contentNode.querySelectorAll('h3');
        for (const title of titles) {
            const ele = document.createElement('h2');
            ele.innerHTML = title.innerHTML;
            title.replaceWith(ele);
        }
        const expls = contentNode.querySelectorAll('h4');
        for (const expl of expls) {
            if (expl.innerHTML.trim() === 'explanation') expl.remove();
        }
        const pres = contentNode.querySelectorAll('pre');
        let lastId = 0;
        for (const pre of pres) {
            const before = pre.previousElementSibling;
            if (!before) continue;
            if (before.textContent === 'input') {
                const tid = before.previousElementSibling;
                if ((tid.textContent).startsWith('样例')) {
                    lastId = MAPPING[tid.textContent.split('样例')[1]];
                    tid.remove();
                }
            } else if (before.textContent !== 'output') continue;
            before.remove();
            const elePre = document.createElement('pre');
            const eleCode = document.createElement('code');
            elePre.appendChild(eleCode);
            eleCode.setAttribute('class', `language-${before.textContent}${lastId}`);
            eleCode.innerHTML = `${pre.innerHTML.trim()}\n`;
            pre.replaceWith(elePre);
        }
        const download = document.querySelector('.glyphicon-download-alt');
        if (download) {
            const file = new PassThrough();
            this.get(download.parentElement.getAttribute('href')).pipe(file);
            files['attachment.zip'] = file;
        }
        const links = contentNode.querySelectorAll('a');
        for (const link of links) {
            if (!link.href.startsWith('/download.php')) continue;
            link.setAttribute('href', 'file://attachment.zip');
        }
        return {
            title: document.querySelector('.page-header.text-center').innerHTML.trim().split(`#${id.split('P')[1]}. `)[1],
            data: {
                'config.yaml': Buffer.from(`time: 1s\nmemory: 256m\ntype: remote_judge\nsubType: uoj\ntarget: ${id}`),
            },
            files,
            tag: [],
            content: contentNode.innerHTML,
        };
    }

    async listProblem(page: number, resync = false) {
        if (resync && page > 1) return [];
        const { text } = await this.get(`/problems?page=${page}`);
        const $dom = new JSDOM(text);
        const index = $dom.window.document.querySelector('ul.pagination>li.active>a').innerHTML;
        if (index !== page.toString()) return [];
        return Array.from($dom.window.document.querySelectorAll('tbody>tr>td>a')).map((i) => `P${i.getAttribute('href').split('/')[4]}`);
    }

    async submitProblem(id: string, lang: string, code: string, info) {
        let programTypeId = lang.includes('uoj.') ? lang.split('uoj.')[1] : 'C++11';
        if (programTypeId === 'Python27') programTypeId = 'Python2.7';
        const comment = setting.langs[lang].comment;
        if (comment) {
            const msg = `Hydro submission #${info.rid}@${new Date().getTime()}`;
            if (typeof comment === 'string') code = `${comment} ${msg}\n${code}`;
            else if (comment instanceof Array) code = `${comment[0]} ${msg} ${comment[1]}\n${code}`;
        }
        const _token = await this.getCsrfToken(`/problem/${id.split('P')[1]}`);
        const { text } = await this.post(`/problem/${id.split('P')[1]}`).send({
            _token,
            answer_answer_language: programTypeId,
            answer_answer_upload_type: 'editor',
            answer_answer_editor: code,
            'submit-answer': 'answer',
        });
        if (!text.includes('我的提交记录')) throw new Error('Submit fail');
        const { text: status } = await this.get(`/submissions?problem_id=${id.split('P')[1]}&submitter=${this.account.handle}`);
        const $dom = new JSDOM(status);
        return $dom.window.document.querySelector('tbody>tr>td>a').innerHTML.split('#')[1];
    }

    async waitForSubmission(id: string, next, end) {
        let i = 1;
        // eslint-disable-next-line no-constant-condition
        while (true) {
            await sleep(3000);
            const { text } = await this.get(`/submission/${id}`);
            const { window: { document } } = new JSDOM(text);
            const find = (content: string) => Array.from(document.querySelectorAll('.panel-heading>.panel-title'))
                .find((n) => n.innerHTML === content).parentElement.parentElement.children[1];
            if (text.includes('Compile Error')) {
                await next({ compilerText: find('详细').children[0].innerHTML });
                return await end({
                    status: STATUS.STATUS_COMPILE_ERROR, score: 0, time: 0, memory: 0,
                });
            }
            const time = parseTimeMS(document.querySelector('tbody>tr').children[4].innerHTML);
            const memory = parseMemoryMB(document.querySelector('tbody>tr').children[5].innerHTML) * 1024;
            const root = document.getElementById('details_details_accordion');
            for (let t = 0; t < i; t++) root.children[0].remove();
            for (const node of root.children) {
                const info = node.children[0].children[0];
                i++;
                await next({
                    status: STATUS.STATUS_JUDGING,
                    case: {
                        status: VERDICT[info.children[2]?.innerHTML?.trim().toUpperCase()] || STATUS.STATUS_WRONG_ANSWER,
                        time: parseTimeMS(info.children[3]?.innerHTML?.split('time: ')?.[1] || 0),
                        memory: parseMemoryMB(info.children[4]?.innerHTML?.split('memory: ')?.[1] || 0) * 1024,
                        message: node.children[1]?.children[0]?.children[5].innerHTML,
                    },
                });
            }
            if (document.querySelector('tbody').innerHTML.includes('Judging')) continue;
            const score = +document.querySelector('tbody>tr').children[3].children[0].innerHTML;
            const status = score === 100 ? STATUS.STATUS_ACCEPTED : STATUS.STATUS_WRONG_ANSWER;
            return await end({
                status,
                score,
                time,
                memory,
            });
        }
    }
}
