/* eslint-disable no-await-in-loop */
import { PassThrough } from 'stream';
import { JSDOM } from 'jsdom';
import {
    Logger, parseMemoryMB, parseTimeMS, randomstring, sleep, STATUS,
} from 'hydrooj';
import { BasicFetcher } from '../fetch';
import { IBasicProvider, RemoteAccount } from '../interface';
import { VERDICT } from '../verdict';

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

export default class UOJProvider extends BasicFetcher implements IBasicProvider {
    constructor(public account: RemoteAccount, private save: (data: any) => Promise<void>) {
        super(account, 'https://uoj.ac', 'form', logger);
    }

    csrf: string;

    async getCsrfToken(url: string) {
        const { text: html, header } = await this.get(url);
        if (header['set-cookie']) await this.setCookie(header['set-cookie'], true);
        let value = /_token *: *"(.+?)"/g.exec(html);
        if (value) return value[1];
        value = /_token" value="(.+?)"/g.exec(html);
        return value?.[1];
    }

    get loggedIn() {
        return this.get('/login').then(({ text: html }) => !html.includes('<title>登录 - '));
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
            const cookie = Array.isArray(header['set-cookie']) ? header['set-cookie'] : [header['set-cookie']];
            cookie.push(...this.cookie);
            await this.save({ cookie });
            this.cookie = cookie;
        }
        if (text === 'ok') return true;
        return text;
    }

    async getProblem(id: string) {
        logger.info(id);
        const res = await this.get(`/problem/${id.split('P')[1]}`);
        const { window: { document } } = new JSDOM(res.text);
        const files = {};
        for (const ele of document.querySelectorAll('article>img[src]')) {
            const src = ele.getAttribute('src');
            if (!src.startsWith('http')) continue;
            const file = new PassThrough();
            this.get(src).pipe(file);
            const fid = randomstring(8);
            files[`${fid}.png`] = file;
            ele.setAttribute('src', `file://${fid}.png`);
        }
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

    async submitProblem(id: string, lang: string, code: string) {
        let programTypeId = lang.includes('uoj.') ? lang.split('uoj.')[1] : 'C++11';
        if (programTypeId === 'Python27') programTypeId = 'Python2.7';
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

    // eslint-disable-next-line consistent-return
    async waitForSubmission(id: string, next, end) {
        let i = 1;
        let count = 0;
        while (count < 120) {
            count++;
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
            const summary = document.querySelector('tbody>tr');
            if (!summary) continue;
            const time = parseTimeMS(summary.children[4].innerHTML);
            const memory = parseMemoryMB(summary.children[5].innerHTML) * 1024;
            let panel = document.getElementById('details_details_accordion_collapse_subtask_1');
            if (!panel) {
                panel = document.getElementById('details_details_accordion');
                if (!panel) continue;
                for (let t = 0; t < i; t++) panel.children[0].remove();
                for (const node of panel.children) {
                    const info = node.children[0].children[0];
                    i++;
                    await next({
                        status: STATUS.STATUS_JUDGING,
                        case: {
                            id: i,
                            subtaskId: 1,
                            status: VERDICT[info.children[2]?.innerHTML?.trim().toUpperCase()] || STATUS.STATUS_WRONG_ANSWER,
                            time: parseTimeMS(info.children[3]?.innerHTML?.split('time: ')?.[1] || 0),
                            memory: parseMemoryMB(info.children[4]?.innerHTML?.split('memory: ')?.[1] || 0) * 1024,
                            message: node.children[1]?.children[0]?.children[5].innerHTML,
                        },
                    });
                }
            } else {
                let subtaskId = 1;
                let removed = 0;
                while (panel) {
                    panel.children[0]?.remove();
                    while (removed < i - 1 && panel.children.length) {
                        panel.children[0].remove();
                        removed++;
                    }
                    for (const node of panel.children) {
                        const info = node.children[0].children[0];
                        i++;
                        await next({
                            status: STATUS.STATUS_JUDGING,
                            case: {
                                id: i,
                                subtaskId,
                                status: VERDICT[info.children[2]?.innerHTML?.trim().toUpperCase()] || STATUS.STATUS_WRONG_ANSWER,
                                time: parseTimeMS(info.children[3]?.innerHTML?.split('time: ')?.[1] || 0),
                                memory: parseMemoryMB(info.children[4]?.innerHTML?.split('memory: ')?.[1] || 0) * 1024,
                                message: node.children[1]?.children[0]?.children[5].innerHTML,
                            },
                        });
                    }
                    subtaskId++;
                    panel = document.getElementById(`details_details_accordion_collapse_subtask_${subtaskId}`);
                }
            }
            if (document.querySelector('tbody').innerHTML.includes('Judging')) continue;
            // eslint-disable-next-line no-unsafe-optional-chaining
            const score = +summary.children[3]?.children[0]?.innerHTML || 0;
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
