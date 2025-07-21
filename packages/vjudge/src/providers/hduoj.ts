/* eslint-disable no-await-in-loop */
import { PassThrough } from 'stream';
import { JSDOM } from 'jsdom';
import charset from 'superagent-charset';
import proxy from 'superagent-proxy';
import {
    htmlEncode, Logger, parseMemoryMB, parseTimeMS, randomstring, sleep, STATUS, superagent,
} from 'hydrooj';
import { BasicFetcher } from '../fetch';
import { IBasicProvider, RemoteAccount } from '../interface';
import { VERDICT } from '../verdict';

declare module 'superagent' {
    interface Request {
        charset(c: string): this;
    }
}

charset(superagent);
proxy(superagent as any);
const logger = new Logger('remote/hduoj');

export default class HDUOJProvider extends BasicFetcher implements IBasicProvider {
    constructor(public account: RemoteAccount, private save: (data: any) => Promise<void>) {
        super(account, 'https://acm.hdu.edu.cn', 'form', logger);
    }

    async getCsrfToken(url: string) {
        const { header } = await this.get(url);
        if (header['set-cookie']) await this.setCookie(header['set-cookie'], true);
        return '';
    }

    get loggedIn() {
        return this.get('/index.php').then(({ text: html }) => html.includes('<div align=left style="font-size:16px;width:150px">'));
    }

    async ensureLogin() {
        if (await this.loggedIn) return true;
        logger.info('retry login');
        await this.getCsrfToken('/');
        await this.post('/userloginex.php?action=login&cid=0&notice=0')
            .set('referer', 'https://acm.hdu.edu.cn/userloginex.php')
            .send({
                username: this.account.handle,
                userpass: this.account.password,
                login: 'Sign In',
            });
        return this.loggedIn;
    }

    async getProblem(id: string) {
        logger.info(id);
        const res = await this.get('/showproblem.php')
            .query({ pid: id.split('P')[1] })
            .buffer(true)
            .charset('gbk');
        const { window: { document } } = new JSDOM(res.text);
        const images = {};
        const files = {};
        const problemContent = document.querySelector('table>tbody').children[3].children[0];
        for (const ele of problemContent.querySelectorAll('img[src]')) {
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
        const info = problemContent.children[1].children[0].children[0].innerHTML;
        const timeMatcher = /Time Limit: \d+\/(\d+) MS/;
        const time = info.match(timeMatcher)[1];
        const memoryMatcher = /Memory Limit: \d+\/(\d+) K/;
        const memory = info.match(memoryMatcher)[1];
        const title = problemContent.children[0].innerHTML;
        let tag = '';
        problemContent.remove();
        problemContent.remove();
        let html = '';
        let preId = 0;
        let markNext = '';
        let lastMark = '';
        for (const node of problemContent.children) {
            const tagName = node.tagName.toLowerCase();
            if (tagName === 'font' || tagName === 'h1' || tagName === 'center' || node.innerHTML === '&nbsp;') {
                continue;
            }
            if (node.getAttribute('align') === 'left') {
                lastMark = node.textContent;
                if (lastMark === 'Source') {
                    tag = node.nextElementSibling.textContent.trim();
                    node.nextElementSibling.innerHTML = tag;
                    continue;
                }
                if (lastMark.startsWith('Sample ')) {
                    if (lastMark.includes('Input')) {
                        preId++;
                        markNext = 'input';
                    } else {
                        markNext = 'output';
                    }
                    continue;
                }
                html += `<h2>${htmlEncode(node.innerHTML)}</h2>`;
            } else {
                if (lastMark.length === 0 || lastMark === 'Source' || node.innerHTML.length === 0) {
                    continue;
                }
                if (lastMark === 'Sample Input' || lastMark === 'Sample Output') {
                    html += `\n<pre><code class="language-${markNext}${preId}">${node.innerHTML}</code></pre>\n`;
                } else {
                    html += node.innerHTML;
                }
            }
        }
        const tagList = (tag.length === 0) ? [] : [tag];
        return {
            title,
            data: {
                'config.yaml': Buffer.from(`time: ${time}ms\nmemory: ${memory}k\ntype: remote_judge\nsubType: hduoj\ntarget: ${id}`),
            },
            files,
            tag: tagList,
            content: html,
        };
    }

    async listProblem(page: number, resync = false) {
        if (resync && page > 1) return [];
        const { text } = await this.get(`/listproblem.php?vol=${page}`);
        const $dom = new JSDOM(text);
        const ProblemTable = $dom.window.document.querySelector('.table_text');
        const ProblemList = ProblemTable.querySelector('script').textContent;
        const matcher = /p\(\d+,(?<num>\d+),\d+,/g;
        let match = matcher.exec(ProblemList);
        const res = [];
        while (match != null) {
            res.push(`P${match[1]}`);
            match = matcher.exec(ProblemList);
        }
        return res;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async submitProblem(id: string, lang: string, code: string, info) {
        await this.ensureLogin();
        const language = lang.includes('hduoj.') ? lang.split('hduoj.')[1] : '0';
        code = Buffer.from(encodeURIComponent(code)).toString('base64');
        const { text } = await this.post('/submit.php?action=submit')
            .set('referer', `http://acm.hdu.edu.cn/submit.php?pid=${id.split('P')[1]}`)
            .send({
                check: 0,
                _usercode: code,
                problemid: id.split('P')[1],
                language,
            });
        if (text.includes('One or more following ERROR(s) occurred.')) {
            throw new Error(text.split('<li>')[1].split('</li>')[0]);
        }
        // eslint-disable-next-line max-len
        const { text: status } = await this.get(`/status.php?first=&pid=${id}&user=${this.account.handle}&lang=${parseInt(language, 10) + 1}&status=0`);
        const $dom = new JSDOM(status);
        const res = $dom.window.document.querySelector('.table_text>tbody');
        return res.children[2].children[0].innerHTML;
    }

    async waitForSubmission(id: string, next, end) {
        while (true) {
            await sleep(3000);
            const { text } = await this.get(`/status.php?first=${id}`);
            const { window: { document } } = new JSDOM(text);
            const submission = document.querySelector('#fixed_table>table>tbody').children[2];
            const status = VERDICT[submission.children[2].children[0].textContent.trim()]
                || STATUS.STATUS_SYSTEM_ERROR;
            if (status === STATUS.STATUS_JUDGING) continue;
            if (status === STATUS.STATUS_COMPILE_ERROR) {
                const { text: info } = await this.get(`http://acm.hdu.edu.cn/viewerror.php?rid=${id}`)
                    .buffer(true)
                    .charset('gbk');
                const ceInfo = new JSDOM(info);
                await next({ compilerText: ceInfo.window.document.querySelector('table>tbody>tr>td>pre').innerHTML });
                return await end({
                    status,
                    score: 0,
                    time: 0,
                    memory: 0,
                });
            }
            const memory = parseMemoryMB(submission.children[5].innerHTML.trim() || 0) * 1024;
            const time = parseTimeMS(submission.children[4].innerHTML.trim() || 0);
            return await end({
                status,
                score: status === STATUS.STATUS_ACCEPTED ? 100 : 0,
                time,
                memory,
            });
        }
    }
}
