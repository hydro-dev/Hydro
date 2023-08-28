/* eslint-disable no-await-in-loop */
import { JSDOM } from 'jsdom';
import {
    Logger, parseMemoryMB, parseTimeMS, sleep, STATUS,
} from 'hydrooj';
import { BasicFetcher } from '../fetch';
import { IBasicProvider, RemoteAccount } from '../interface';

const logger = new Logger('remote/hduoj');
const statusDict = {
    Queuing: STATUS.STATUS_JUDGING,
    Accepted: STATUS.STATUS_ACCEPTED,
    'Wrong Answer': STATUS.STATUS_WRONG_ANSWER,
    'Presentation Error': STATUS.STATUS_WRONG_ANSWER,
    'Compilation Error': STATUS.STATUS_COMPILE_ERROR,
    'Runtime Error': STATUS.STATUS_RUNTIME_ERROR,
    'Time Limit Exceeded': STATUS.STATUS_TIME_LIMIT_EXCEEDED,
    'Memory Limit Exceeded': STATUS.STATUS_MEMORY_LIMIT_EXCEEDED,
    'Output Limit Exceeded': STATUS.STATUS_OUTPUT_LIMIT_EXCEEDED,
};

export default class HDUOJProvider extends BasicFetcher implements IBasicProvider {
    constructor(public account: RemoteAccount, private save: (data: any) => Promise<void>) {
        super(account, 'https://acm.hdu.edu.cn', 'form', logger);
    }

    get loggedIn() {
        return this.get('/').then(({ text: html }) => !html
            .includes('<form method=post action="/userloginex.php?action=login">'));
    }

    async ensureLogin() {
        if (await this.loggedIn) return true;
        logger.info('retry login');
        const { header } = await this.get('/');
        if (header['set-cookie']) {
            await this.save({ cookie: header['set-cookie'] });
            this.cookie = header['set-cookie'];
        }
        await this.post('/userloginex.php?action=login')
            .send({
                username: this.account.handle,
                userpass: this.account.password,
                login: 'Sign In',
            });
        return this.loggedIn;
    }

    async getProblem(id: string) {
        logger.info(id);
        const res = await this.get(`/showproblem.php?pid=${id.split('P')[1]}`);
        const { window: { document } } = new JSDOM(res.text);
        const contentNode = document.querySelector('body>table>tbody>tr:nth-child(4)>td');
        const title = contentNode.querySelector('h1').textContent;
        contentNode.querySelectorAll('br').forEach(ele => ele.remove());
        contentNode.querySelector('h1:first-child').remove();
        contentNode.querySelector('font:first-child').remove();
        contentNode.querySelector('center').remove();
        contentNode.querySelectorAll('div.panel_title').forEach(title => {
            const ele = document.createElement('h2');
            ele.innerHTML = title.innerHTML;
            title.replaceWith(ele);
        });
        contentNode.querySelectorAll('div.panel_content').forEach(content => {
            const ele = document.createElement('p');
            ele.innerHTML = content.innerHTML;
            content.replaceWith(ele);
        });
        let sampleId = 0;
        contentNode.querySelectorAll('p>pre>div').forEach(sample => {
            const sampleNode = sample.parentElement.parentElement;
            const title = sampleNode.previousElementSibling;
            let sampleType;
            if (title.innerHTML == 'Sample Input') sampleType = 'input', ++sampleId;
            else if (title.innerHTML == 'Sample Output') sampleType = 'output';
            else return;
            const elePre = document.createElement('pre');
            const eleCode = document.createElement('code');
            elePre.appendChild(eleCode);
            eleCode.setAttribute('class', `language-${sampleType}${sampleId}`);
            eleCode.innerHTML = `${sample.innerHTML.trim()}\n`;
            sampleNode.replaceWith(elePre);
            title.remove();
        });
        contentNode.querySelectorAll('div.panel_bottom').forEach(ele => ele.remove());
        return {
            title,
            data: {
                'config.yaml': Buffer.from(`time: ${1000}ms\nmemory: ${1000}k\ntype: remote_judge\nsubType: hduoj\ntarget: ${id}`),
            },
            files: {},
            tag: [],
            content: contentNode.innerHTML.trim(),
        };
    }

    async listProblem(page: number, resync = false) {
        const ProblemMatcher = /p\(\d,(\d+),\d,".+?",\d+,\d+\);/g;
        if (resync && page > 1) return [];
        const { text } = await this.get(`/listproblem.php?vol=${page}`);
        const result = [];
        let match = ProblemMatcher.exec(text);
        while (match) {
            result.push(`P${match[1]}`);
            match = ProblemMatcher.exec(text);
        }
        return result;
    }

    async submitProblem(id: string, lang: string, source: string) {
        await this.ensureLogin();
        const language = lang.includes('hduoj.') ? lang.split('hduoj.')[1] : '0';
        const { text } = await this.post('/submit.php?action=submit')
            .send({
                check: 0,
                problemid: id.split('P')[1],
                language,
                _usercode: Buffer.from(encodeURIComponent(source)).toString('base64'),
            });
        const { window: { document } } = new JSDOM(text);
        return document.querySelector('#fixed_table>table>tbody>tr:nth-child(3)>td:nth-child(1)').innerHTML;
    }

    async getCompilerText(id: string) {
        const { text } = await this.get(`/viewerror.php?rid=${id}`);
        const { window: { document } } = new JSDOM(text);
        return document.querySelector('tbody>tr>td>pre').innerHTML;
    }

    async waitForSubmission(id: string, next, end) {
        let count = 0;
        while (count < 60) {
            count++;
            await sleep(3000);
            const { text } = await this.get(`/status.php?first=${id}`);
            const { window: { document } } = new JSDOM(text);
            const recordNode = document.querySelector('#fixed_table>table>tbody>tr:nth-child(3)');
            const statusText = recordNode.querySelector('td:nth-child(3) font').innerHTML;
            const status = statusDict[statusText] || STATUS.STATUS_SYSTEM_ERROR;
            if (status === STATUS.STATUS_JUDGING) continue;
            const time = recordNode.querySelector('td:nth-child(5)').innerHTML;
            const memory = recordNode.querySelector('td:nth-child(6)').innerHTML;
            if (status === STATUS.STATUS_COMPILE_ERROR) {
                await next({ compilerText: await this.getCompilerText(id) });
            }
            await end({
                status,
                score: status === STATUS.STATUS_ACCEPTED ? 100 : 0,
                time: parseTimeMS(time),
                memory: parseMemoryMB(memory) * 1024,
            });
            return;
        }
    }
}
