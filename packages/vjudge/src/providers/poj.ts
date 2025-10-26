/* eslint-disable no-await-in-loop */
import { PassThrough } from 'stream';
import { JSDOM } from 'jsdom';
import {
    htmlEncode, Logger, parseMemoryMB, parseTimeMS, randomstring, sleep, STATUS,
} from 'hydrooj';
import { BasicFetcher } from '../fetch';
import { IBasicProvider, RemoteAccount } from '../interface';
import { VERDICT } from '../verdict';

const logger = new Logger('remote/poj');

const langs = {
    default: 'en',
    'zh-CN': 'zh',
};

export default class POJProvider extends BasicFetcher implements IBasicProvider {
    static Langs = {
        'cc.cc98': {
            display: 'C++',
            key: '0',
        },
        c: {
            display: 'C',
            key: '1',
        },
        java: {
            display: 'Java',
            key: '2',
        },
        pas: {
            display: 'Pascal',
            key: '3',
        },
    };

    constructor(public account: RemoteAccount, private save: (data: any) => Promise<void>) {
        super(account, 'http://poj.org', 'form', logger);
    }

    async getCsrfToken(url: string) {
        const { header } = await this.get(url);
        if (header['set-cookie']) await this.setCookie(header['set-cookie']);
        return '';
    }

    get loggedIn() {
        return this.get('/submit?problem_id=1000').then(({ text: html }) => !html.includes('<form method=POST action=login>'));
    }

    async ensureLogin() {
        if (await this.loggedIn) return true;
        logger.info('retry login');
        await this.getCsrfToken('/');
        await this.post('/login')
            .set('referer', 'http://poj.org/')
            .send({
                user_id1: this.account.handle,
                password1: this.account.password,
                B1: 'login',
                url: '/',
            });
        return this.loggedIn;
    }

    async getProblem(id: string) {
        logger.info(id);
        const res = await this.get(`/problem?id=${id.split('P')[1]}`);
        const { window: { document } } = new JSDOM(res.text);
        const files = {};
        const main = document.querySelector('[background="images/table_back.jpg"]>tbody>tr>td');
        const languages = [...main.children[0].children[0].children]
            .map((i) => i.getAttribute('value'));
        const info = main.getElementsByClassName('plm')[0]
            .children[0].children[0].children[0];
        const time = info.children[0].innerHTML.split('</b> ')[1].toLowerCase().trim();
        const memory = info.children[2].innerHTML.split('</b> ')[1].toLowerCase().trim();
        const contents = {};
        const images = {};
        let tag = '';
        for (const lang of languages) {
            await sleep(1000);
            const { text } = await this.get(`/problem?id=${id.split('P')[1]}&lang=${lang}&change=true`);
            const { window: { document: page } } = new JSDOM(text);
            const content = page.querySelector('[background="images/table_back.jpg"]>tbody>tr>td');
            content.children[0].remove();
            content.children[0].remove();
            content.children[0].remove();
            for (const ele of content.querySelectorAll('img[src]')) {
                const src = ele.getAttribute('src');
                if (images[src]) {
                    ele.setAttribute('src', `file://${images[src]}.png`);
                    continue;
                }
                const file = new PassThrough();
                this.get(src).pipe(file);
                const fid = randomstring(8);
                images[src] = fid;
                files[`${fid}.png`] = file;
                ele.setAttribute('src', `file://${fid}.png`);
            }
            let lastId = 0;
            let markNext = '';
            let html = '';
            for (const node of content.children) {
                if (node.className.includes('pst')) {
                    if (!node.innerHTML.startsWith('Sample ')) {
                        html += `<h2>${htmlEncode(node.innerHTML)}</h2>`;
                        if (node.textContent === 'Source') {
                            tag = node.nextElementSibling.textContent.trim();
                            node.nextElementSibling.innerHTML = tag;
                        }
                    } else if (node.innerHTML.startsWith('Sample Input')) {
                        lastId++;
                        markNext = 'input';
                    } else {
                        markNext = 'output';
                    }
                } else if (node.className.includes('sio')) {
                    html += `\n\n<pre><code class="language-${markNext}${lastId}">${node.innerHTML}</code></pre>\n\n`;
                } else if (node.className.includes('ptx')) {
                    for (const primaryTd of node.querySelectorAll('td')) {
                        const td = page.createElement('td');
                        td.textContent = primaryTd.textContent;
                        if (primaryTd.colSpan > 1) td.colSpan = primaryTd.colSpan;
                        primaryTd.replaceWith(td);
                    }
                    for (const primaryPre of node.querySelectorAll('pre')) {
                        const pre = page.createElement('pre');
                        for (const inner of primaryPre.innerHTML.split('<br>')) {
                            if (inner !== '') {
                                const preP = page.createElement('p');
                                preP.innerHTML = inner;
                                pre.append(preP);
                            }
                        }
                        primaryPre.replaceWith(pre);
                    }
                    for (const item of node.innerHTML.split('\n<br>')) {
                        if (item !== '') {
                            const p = page.createElement('p');
                            p.innerHTML = item.trim().replace(/\$/g, '<span>$</span>');
                            html += p.outerHTML;
                        }
                    }
                } else html += node.innerHTML;
            }
            if (lang in langs) {
                contents[langs[lang]] = html;
            }
        }
        return {
            title: main.getElementsByClassName('ptt')[0].innerHTML,
            data: {
                'config.yaml': Buffer.from(`time: ${time}\nmemory: ${memory}\ntype: remote_judge\nsubType: poj\ntarget: ${id}`),
            },
            files,
            tag: [tag],
            content: JSON.stringify(contents),
        };
    }

    async listProblem(page: number) {
        const { text } = await this.get(`/problemlist?volume=${page}`);
        const $dom = new JSDOM(text);
        return Array.from($dom.window.document.querySelectorAll('.a>tbody>tr[align="center"]'))
            .map((i) => `P${+i.children[0].innerHTML ? i.children[0].innerHTML : i.children[1].innerHTML}`);
    }

    async submitProblem(id: string, language: string, code: string) {
        await this.ensureLogin();
        code = Buffer.from(code).toString('base64');
        const { text } = await this.post('/submit').send({
            problem_id: id.split('P')[1],
            language,
            source: code,
            submit: 'Submit',
            encoded: 1,
        });
        if (text.includes('Error Occurred')) {
            throw new Error(text.split('<li>')[1].split('</li>')[0]);
        }
        const { text: status } = await this.get(`/status?problem_id=${id.split('P')[1]}&user_id=${this.account.handle}&result=&language=${language}`);
        const $dom = new JSDOM(status);
        return $dom.window.document.querySelector('.a>tbody>tr[align="center"]>td').innerHTML;
    }

    // eslint-disable-next-line consistent-return
    async waitForSubmission(id: string, next, end) {
        let count = 0;
        while (count < 60) {
            count++;
            await sleep(3000);
            const { text } = await this.get(`/status?top=${+id + 1}`);
            const { window: { document } } = new JSDOM(text);
            const submission = document.querySelector('.a>tbody>tr[align="center"]');
            const status = VERDICT[submission.children[3].children[0].textContent.trim().toUpperCase()]
                || STATUS.STATUS_SYSTEM_ERROR;
            if (status === STATUS.STATUS_JUDGING) continue;
            if (status === STATUS.STATUS_COMPILE_ERROR) {
                const { text: info } = await this.get(`/showcompileinfo?solution_id=${id}`);
                const ceInfo = new JSDOM(info);
                await next({ compilerText: ceInfo.window.document.querySelector('pre>font').innerHTML });
                return await end({
                    status,
                    score: 0,
                    time: 0,
                    memory: 0,
                });
            }
            const memory = parseMemoryMB(submission.children[4].innerHTML.trim() || 0) * 1024;
            const time = parseTimeMS(submission.children[5].innerHTML.trim() || 0);
            return await end({
                status,
                score: status === STATUS.STATUS_ACCEPTED ? 100 : 0,
                time,
                memory,
            });
        }
    }
}
