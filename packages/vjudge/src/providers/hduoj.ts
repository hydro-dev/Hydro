/* eslint-disable no-await-in-loop */
import { JSDOM } from 'jsdom';
import {
    Logger, STATUS, sleep,
    parseTimeMS, parseMemoryMB,
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
        return {
            title: contentNode.querySelector('h1').innerHTML,
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
        let match, result = [];
        while (match = ProblemMatcher.exec(text)) result.push(`P${match[1]}`);
        return result;
    }

    async submitProblem(id: string, lang: string, source: string, info, next, end) {
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
            const message = {
                status,
                score: status === STATUS.STATUS_ACCEPTED ? 100 : 0,
                time: parseTimeMS(time),
                memory: parseMemoryMB(memory) * 1024,
            };
            if (status === STATUS.STATUS_COMPILE_ERROR) {
                message.compilerText = await this.getCompilerText(id);
            }
            await end(message);
            return;
        }
    }
}
