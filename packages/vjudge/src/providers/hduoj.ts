/* eslint-disable no-constant-condition */
/* eslint-disable no-await-in-loop */
import { PassThrough } from 'stream';
import { JSDOM } from 'jsdom';
import { } from 'superagent';
import charset from 'superagent-charset';
import proxy from 'superagent-proxy';
import {
    Logger, parseMemoryMB, parseTimeMS, sleep, STATUS, superagent,
} from 'hydrooj';
import { BasicFetcher } from '../fetch';
import { IBasicProvider, RemoteAccount } from '../interface';

declare module 'superagent' {
    interface Request {
        charset(c: string): this;
    }
}

charset(superagent);
proxy(superagent as any);
const logger = new Logger('remote/hduoj');

const StatusMapping = {
    Queuing: STATUS.STATUS_WAITING,
    Running: STATUS.STATUS_JUDGING,
    Compiling: STATUS.STATUS_COMPILING,
    Accepted: STATUS.STATUS_ACCEPTED,
    'Presentation Error': STATUS.STATUS_WRONG_ANSWER,
    'Runtime Error': STATUS.STATUS_RUNTIME_ERROR,
    'Output Limit Exceeded': STATUS.STATUS_OUTPUT_LIMIT_EXCEEDED,
    'Wrong Answer': STATUS.STATUS_WRONG_ANSWER,
    'Compilation Error': STATUS.STATUS_COMPILE_ERROR,
    'Memory Limit Exceeded': STATUS.STATUS_MEMORY_LIMIT_EXCEEDED,
    'Time Limit Exceeded': STATUS.STATUS_TIME_LIMIT_EXCEEDED,
};

export default class HDUOJProvider extends BasicFetcher implements IBasicProvider {
    constructor(public account: RemoteAccount, private save: (data: any) => Promise<void>) {
        super(account, 'https://acm.hdu.edu.cn', 'form', logger);
    }

    async getCsrfToken(url: string) {
        const { header } = await this.get(url);
        if (header['set-cookie']) {
            await this.save({ cookie: header['set-cookie'] });
            this.cookie = header['set-cookie'];
        }
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
        const url = new URL('/showproblem.php', this.account.endpoint || 'https://acm.hdu.edu.cn').toString();
        const res = await superagent.get(url)
            .query({ pid: id.split('P')[1] })
            .buffer(true)
            .charset('gbk');
        const { window: { document } } = new JSDOM(res.text);
        const files = {};
        const main = document.querySelector('table>tbody').children[3].children[0];
        const limit = main.querySelectorAll('span')[0].innerHTML.split(' ');
        const time = limit[2].split('/')[1];
        const memory = parseInt(limit[6].split('/')[1], 10) / 1024;
        const contents = {};
        const images = {};
        await sleep(1000);
        main.querySelectorAll('img[src]').forEach((ele) => {
            let src = ele.getAttribute('src');
            if (src.startsWith('../..')) {
                src = src.replace('../..', '');
            }
            if (src.startsWith('..')) {
                src = src.replace('..', '');
            }
            if (src.startsWith('/..')) {
                src = src.replace('/..', '');
            }
            if (!src.startsWith('/')) {
                src = `/${src}`;
            }
            if (images[src]) {
                ele.setAttribute('src', `/d/hduoj/p/${id}/file/${images[src]}.png`);
                return;
            }
            const file = new PassThrough();
            this.get(src).pipe(file);
            const fid = String.random(8);
            images[src] = fid;
            files[`${fid}.png`] = file;
            ele.setAttribute('src', `/d/hduoj/p/${id}/file/${fid}.png`);
        });
        let html = '';
        const end = '```\n\n';
        const input = '\n\n```input1\n';
        const ouput = '\n\n```output1\n';
        const node = main.children;
        const tag = [];
        for (let i = 1; i < main.children.length; i++) {
            if (node[i - 1].innerHTML === 'Problem Description') {
                const description = node[i].innerHTML.replace('/<center><img/g', '<img').replace('/.png"></center>/g', '.png">');
                logger.info(description);
                html += `<h2>Description</h2><p>${description}</p>\n`;
            } else if (node[i - 1].innerHTML === 'Input') {
                html += `<h2>Input</h2><p>${node[i].innerHTML}</p>\n`;
            } else if (node[i - 1].innerHTML === 'Output') {
                html += `<h2>Output</h2><p>${node[i].innerHTML}</p>\n`;
            } else if (node[i - 1].innerHTML === 'Sample Input') {
                let text = node[i].children[0].children[0].innerHTML;
                if (!text.endsWith('\n')) {
                    text += '\n';
                }
                html += input + text + end;
            } else if (node[i - 1].innerHTML === 'Sample Output') {
                let text = node[i].children[0].children[0].innerHTML;
                if (!text.endsWith('\n')) {
                    text += '\n';
                }
                html += ouput + text + end;
            } else if (node[i - 1].innerHTML === 'Source') {
                tag.push(node[i].children[0].innerHTML.trim().replace('/ /g', '-').replace('/,/', '-'));
                html += `<h2>Source</h2><p>${node[i].children[0].innerHTML}</p>`;
            }
        }
        contents['zh'] = html;
        return {
            title: node[0].textContent,
            data: {
                'config.yaml': Buffer.from(`time: ${time}ms\nmemory: ${memory}m\ntype: remote_judge\nsubType: hduoj\ntarget: ${id}`),
            },
            files,
            tag,
            content: JSON.stringify(contents),
        };
    }

    async listProblem(page: number, resync = false) {
        if (resync && page > 1) return [];
        const { text } = await this.get(`/listproblem.php?vol=${page}`);
        const $dom = new JSDOM(text);
        const ProblemTable = $dom.window.document.querySelector('.table_text');
        const ProblemList = ProblemTable.querySelector('script').textContent;
        const matcher = /p\(\d+,(?<num>\d+),/g;
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
        return $dom.window.document.querySelector('.table_text>tbody>tr[align="center"]>td').innerHTML;
    }

    async waitForSubmission(id: string, next, end) {
        while (true) {
            await sleep(3000);
            const { text } = await this.get(`/status.php?first=${id}`);
            const { window: { document } } = new JSDOM(text);
            const submission = document.querySelector('.table_text>tbody>tr[align="center"]');
            const status = StatusMapping[submission.children[2].children[0].textContent.trim()]
                || STATUS.STATUS_SYSTEM_ERROR;
            if (status === STATUS.STATUS_JUDGING) continue;
            if (status === STATUS.STATUS_COMPILE_ERROR) {
                const { text: info } = await superagent.get(`http://acm.hdu.edu.cn/viewerror.php?rid=${id}`)
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
