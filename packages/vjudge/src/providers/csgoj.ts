/* eslint-disable no-await-in-loop */
import { PassThrough } from 'stream';
import { JSDOM } from 'jsdom';
import {
    Logger, randomstring, sleep, STATUS,
} from 'hydrooj';
import { BasicFetcher } from '../fetch';
import { IBasicProvider, RemoteAccount } from '../interface';

const logger = new Logger('remote/csgoj');
const statusDict = {
    0: STATUS.STATUS_COMPILING,
    1: STATUS.STATUS_COMPILING,
    2: STATUS.STATUS_COMPILING,
    3: STATUS.STATUS_JUDGING,
    4: STATUS.STATUS_ACCEPTED,
    5: STATUS.STATUS_WRONG_ANSWER,
    6: STATUS.STATUS_WRONG_ANSWER,
    7: STATUS.STATUS_TIME_LIMIT_EXCEEDED,
    8: STATUS.STATUS_MEMORY_LIMIT_EXCEEDED,
    9: STATUS.STATUS_OUTPUT_LIMIT_EXCEEDED,
    10: STATUS.STATUS_RUNTIME_ERROR,
    11: STATUS.STATUS_COMPILE_ERROR,
};

const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:104.0) Gecko/20100101 Firefox/104.0';

export default class CSGOJProvider extends BasicFetcher implements IBasicProvider {
    static Langs = {
        c: {
            display: 'C',
            key: '0',
        },
        'cc.cc17o2': {
            display: 'C++',
            key: '1',
        },
        java: {
            display: 'Java',
            key: '3',
        },
        'py.py3': {
            display: 'Python3',
            key: '6',
        },
        go: {
            display: 'Go',
            key: '17',
        },
    };

    constructor(public account: RemoteAccount, private save: (data: any) => Promise<void>) {
        super(account, 'https://cpc.csgrandeur.cn', 'form', logger, {
            headers: { 'User-Agent': userAgent },
            post: { headers: { 'X-Requested-With': 'XMLHttpRequest' } },
        });
        if (account.cookie) this.cookie = account.cookie;
    }

    get loggedIn() {
        return this.get('/').then(({ text: html }) => !html
            .includes('<form id="login_form" class="form-signin" method="post" action="/csgoj/user/login_ajax">'));
    }

    async ensureLogin() {
        if (await this.loggedIn) return true;
        logger.info('retry login');
        const { header } = await this.get('/csgoj/user/login_ajax');
        if (header['set-cookie']) await this.setCookie(header['set-cookie'], true);
        await this.post('/csgoj/user/login_ajax')
            .set('referer', 'https://cpc.csgrandeur.cn/')
            .send({
                user_id: this.account.handle,
                password: this.account.password,
            });
        return this.loggedIn;
    }

    async getProblem(id: string) {
        logger.info(id);
        const res = await this.get(`/csgoj/problemset/problem?pid=${id.split('P')[1]}`);
        const { window: { document } } = new JSDOM(res.text);
        const title = document.getElementsByTagName('title')[0].innerHTML.replace(`${id.split('P')[1]}:`, '');
        const pDescription = document.querySelector('div[name="Description"]');
        const files = {};
        const images = {};
        for (const ele of pDescription.querySelectorAll('img[src]')) {
            let src = ele.getAttribute('src').replace('.svg', '.png');
            src = new URL(src, 'https://cpc.csgrandeur.cn').toString();
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
        const description = [...pDescription.children].map((i) => i.outerHTML).join('');
        const input = [...document.querySelector('div[name="Input"]').children].map((i) => i.outerHTML).join('');
        const output = [...document.querySelector('div[name="Output"]').children].map((i) => i.outerHTML).join('');
        const sampleInput = `\`\`\`input1\n${document.querySelector('pre.sample_input_area').innerHTML.trim()}\n\`\`\``;
        const sampleOutput = `\`\`\`output1\n${document.querySelector('pre.sample_output_area').innerHTML.trim()}\n\`\`\``;
        const contents = [description, input, output, sampleInput, sampleOutput];
        const hint = document.querySelector('div[name="Hint"]');
        if (hint.textContent.trim().length > 4) {
            contents.push([...hint.children].map((i) => i.outerHTML).join(''));
        }
        const tag = document.querySelector('div[name="Source"]>a').textContent.trim();
        const limit = document.querySelectorAll('span[class="inline_span"]');
        const time = `${+limit[0].textContent.split(' ')[6] * 1000}`;
        const memory = limit[1].textContent.split(' ')[2];
        return {
            title,
            data: {
                'config.yaml': Buffer.from(`time: ${time}\nmemory: ${memory}\ntype: remote_judge\nsubType: csgoj\ntarget: ${id}`),
            },
            files,
            tag: [tag],
            content: JSON.stringify({ zh: contents.join('\n\n') }),
        };
    }

    async listProblem(page: number) {
        const offset = (page - 1) * 100;
        const result = await this
            .get(`/csgoj/problemset/problemset_ajax?search=&sort=problem_id&order=asc&offset=${offset}&limit=100`)
            .set('referer', 'https://cpc.csgrandeur.cn/csgoj/problemset')
            .set('X-Requested-With', 'XMLHttpRequest');
        return result.body.rows.map((i) => `P${+i.problem_id}`);
    }

    async submitProblem(id: string, lang: string, source: string) {
        await this.ensureLogin();
        const result = await this.post('/csgoj/Problemset/submit_ajax')
            .set('referer', `https://cpc.csgrandeur.cn/csgoj/problemset/submit?pid=${id.split('P')[1]}`)
            .send({
                pid: id.split('P')[1],
                language: lang,
                source,
            });
        return result.body.data.solution_id;
    }

    async waitForSubmission(id: string, next, end) {
        let count = 0;
        while (count < 60) {
            count++;
            await sleep(3000);
            const { body } = await this
                // eslint-disable-next-line max-len
                .get(`/csgoj/status/status_ajax?sort=solution_id_show&order=desc&offset=0&limit=20&problem_id=&user_id=&solution_id=${id}&language=-1&result=-1`)
                .set('X-Requested-With', 'XMLHttpRequest');
            const status = statusDict[body.rows[0].result] || STATUS.STATUS_SYSTEM_ERROR;
            if (status === STATUS.STATUS_JUDGING || status === STATUS.STATUS_COMPILING) continue;
            await end({
                status,
                score: status === STATUS.STATUS_ACCEPTED ? 100 : 0,
                time: body.rows[0].time,
                memory: body.rows[0].memory,
            });
            return;
        }
    }
}
