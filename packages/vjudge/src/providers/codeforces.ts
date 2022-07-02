/* eslint-disable no-await-in-loop */
import { PassThrough } from 'stream';
import findChrome from 'chrome-finder';
import { JSDOM } from 'jsdom';
import type { Browser, Page } from 'puppeteer';
import puppeteer from 'puppeteer-extra';
import PortalPlugin from 'puppeteer-extra-plugin-portal';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import superagent from 'superagent';
import proxy from 'superagent-proxy';
import { STATUS } from '@hydrooj/utils/lib/status';
import { sleep } from '@hydrooj/utils/lib/utils';
import { buildContent } from 'hydrooj/src/lib/content';
import { Logger } from 'hydrooj/src/logger';
import * as setting from 'hydrooj/src/model/setting';
import { IBasicProvider, RemoteAccount } from '../interface';
import { VERDICT } from '../verdict';

proxy(superagent);
const logger = new Logger('remote/codeforces');
puppeteer.use(StealthPlugin()).use(PortalPlugin({
    webPortalConfig: {
        listenOpts: {
            port: 3000,
        },
        baseUrl: 'http://localhost:3000',
    },
}));

export function getDifficulty(tags: string[]) {
    const d = tags.find((i) => /^\*\d+$/.test(i))?.split('*')[1];
    if (!(d && +d)) return null;
    const map = [
        [500, 1],
        [800, 2],
        [1200, 3],
        [1500, 4],
        [1800, 5],
        [2000, 6],
        [2200, 7],
        [2400, 8],
        [2600, 9],
        [2800, 10],
    ];
    for (const [i, j] of map) if (+d < i) return j;
    return 10;
}

export default class CodeforcesProvider implements IBasicProvider {
    constructor(public account: RemoteAccount, private save: (data: any) => Promise<void>) {
        if (account.cookie) this.cookie = account.cookie;
        this.account.endpoint ||= 'https://codeforces.com';
    }

    cookie: string[] = [];
    csrf: string;
    puppeteer: Browser;

    async ensureBrowser() {
        if (this.puppeteer) return true;
        try {
            const executablePath = findChrome();
            logger.debug(`Using chrome found at ${executablePath}`);
            const args = ['--disable-gpu', '--disable-setuid-sandbox'];
            if (this.account.proxy?.startsWith('http://')) args.push(`--proxy-server=${this.account.proxy.split('//')[1]}`);
            if (process.platform === 'linux' && process.getuid() === 0) args.push('--no-sandbox');
            this.puppeteer = await puppeteer.launch({ headless: true, executablePath, args });
            logger.success('Successfully launched browser');
        } catch (e) {
            logger.error(e);
            logger.error('Failed to launch browser, using fallback mode');
            return false;
        }
        return true;
    }

    async getPage() {
        const page = await this.puppeteer.newPage();
        const url = await page.openPortal();
        logger.info('portal=', url);
        for (const str of this.cookie) {
            const [name, value] = str.split(';')[0].split('=');
            await page.setCookie({ name, value, domain: 'codeforces.com' });
        }
        return page;
    }

    async clearPage(page: Page) {
        let cookies = await page.cookies();
        while (!cookies.find((i) => i.name === 'evercookie_etag').value) {
            await sleep(1000);
            cookies = await page.cookies();
        }
        this.cookie = cookies.map((i) => `${i.name}=${i.value}`);
        await this.save({ cookie: this.cookie });
        await page.close();
    }

    get(url: string) {
        logger.debug('get', url);
        if (!url.includes('//')) url = `${this.account.endpoint}${url}`;
        const req = superagent.get(url).set('Cookie', this.cookie);
        if (this.account.proxy) return req.proxy(this.account.proxy);
        return req;
    }

    post(url: string) {
        logger.debug('post', url, this.cookie);
        if (!url.includes('//')) url = `${this.account.endpoint}${url}`;
        const req = superagent.post(url).type('form').set('Cookie', this.cookie);
        if (this.account.proxy) return req.proxy(this.account.proxy);
        return req;
    }

    getCookie(target: string) {
        return this.cookie.find((i) => i.startsWith(`${target}=`))?.split('=')[1]?.split(';')[0];
    }

    tta(_39ce7: string) {
        let _tta = 0;
        for (let c = 0; c < _39ce7.length; c++) {
            _tta = (_tta + (c + 1) * (c + 2) * _39ce7.charCodeAt(c)) % 1009;
            if (c % 3 === 0) _tta++;
            if (c % 2 === 0) _tta *= 2;
            if (c > 0) _tta -= Math.floor(_39ce7.charCodeAt(Math.floor(c / 2)) / 2) * (_tta % 5);
            _tta = ((_tta % 1009) + 1009) % 1009;
        }
        return _tta;
    }

    async checkLogin() {
        await this.ensureBrowser();
        const page = await this.getPage();
        await page.goto(`${this.account.endpoint}/enter`, { waitUntil: 'networkidle2' });
        const html = await page.content();
        let cookies = await page.cookies();
        let c = 0;
        while (!cookies.find((i) => i.name === 'evercookie_etag').value && c <= 60) {
            await sleep(1000);
            cookies = await page.cookies();
            c++;
        }
        if (c < 60) {
            this.cookie = cookies.map((i) => `${i.name}=${i.value}`);
            await this.save({ cookie: this.cookie });
        }
        const ftaa = cookies.find((i) => i.name === '70a7c28f3de')?.value;
        const bfaa = /_bfaa = "(.{32})"/.exec(html)?.[1];
        await page.close();
        return [ftaa, bfaa, !html.includes('Login into Codeforces')];
    }

    async getCsrfToken(url: string) {
        const { text: html } = await this.get(url);
        const { window: { document } } = new JSDOM(html);
        if (document.body.children.length < 2 && html.length < 512) {
            throw new Error(document.body.textContent);
        }
        const ftaa = this.getCookie('70a7c28f3de');
        const bfaa = /_bfaa = "(.{32})"/.exec(html)?.[1] || this.getCookie('raa') || this.getCookie('bfaa');
        return [
            (
                document.querySelector('meta[name="X-Csrf-Token"]')
                || document.querySelector('input[name="csrf_token"]')
            )?.getAttribute('content'),
            ftaa, bfaa,
        ];
    }

    get loggedIn() {
        return this.puppeteer
            ? this.checkLogin().then(([, , loggedIn]) => loggedIn)
            : this.get('/enter').then(({ text: html }) => {
                if (html.includes('Login into Codeforces')) return false;
                return true;
            });
    }

    async normalLogin() {
        const [csrf, ftaa, bfaa] = await this.getCsrfToken('/enter');
        const res = await this.post('/enter').send({
            csrf_token: csrf,
            action: 'enter',
            ftaa,
            bfaa,
            handleOrEmail: this.account.handle,
            password: this.account.password,
            remember: 'on',
        });
        const cookie = res.header['set-cookie'];
        if (cookie) {
            await this.save({ cookie });
            this.cookie = cookie;
        }
    }

    async puppeteerLogin() {
        if (!this.puppeteer) return false;
        const page = await this.puppeteer.newPage();
        await page.goto(`${this.account.endpoint}/enter`, { waitUntil: 'networkidle2' });
        const url = await page.openPortal();
        logger.info(`Login portal opened: ${url}`);
        await page.waitForRequest((req) => {
            if (req.method() !== 'POST') return false;
            if (!req.url().endsWith('/enter')) return false;
            console.log(req);
            return true;
        }, { timeout: 24 * 3600 * 1000 });
        await page.waitForTimeout(10 * 1000);
        await this.clearPage(page);
        return true;
    }

    async ensureLogin() {
        await this.ensureBrowser();
        if (await this.loggedIn) return true;
        logger.info('retry normal login');
        await this.normalLogin();
        if (await this.loggedIn) return true;
        if (!this.puppeteer) return false;
        logger.info('starting puppeteer login');
        await this.puppeteerLogin();
        if (await this.loggedIn) return true;
        return false;
    }

    async getPdfProblem(id: string) {
        const [, contestId, problemId] = id.startsWith('P921')
            ? ['', '921', '01']
            : /^P(\d+)([A-Z][0-9]*)$/.exec(id);
        const file = new PassThrough();
        this.get(`/problemset/problem/${contestId}/${problemId}`).pipe(file);
        return {
            title: '__NO_TITLE__',
            data: { 'config.yaml': Buffer.from(`type: remote_judge\nsubType: codeforces\ntarget: ${id}`) },
            files: { 'problem.pdf': file },
            tag: [],
            content: '@[pdf](file://problem.pdf)',
        };
    }

    async getProblem(id: string) {
        logger.info(id);
        if (id === 'P936E') return null; // Problem Missing
        const [, contestId, problemId] = id.startsWith('P921')
            ? ['', '921', '01']
            : /^P(\d+)([A-Z][0-9]*)$/.exec(id);
        const res = await this.get(`/problemset/problem/${contestId}/${problemId}`);
        if (!res.text) return await this.getPdfProblem(id);
        const $dom = new JSDOM(res.text.replace(/\$\$\$/g, '$'));
        const tag = Array.from($dom.window.document.querySelectorAll('.tag-box')).map((i) => i.textContent.trim());
        const text = $dom.window.document.querySelector('.problem-statement').innerHTML;
        const { window: { document } } = new JSDOM(text);
        const files = {};
        document.querySelectorAll('img[src]').forEach((ele) => {
            const src = ele.getAttribute('src');
            if (!src.startsWith('http')) return;
            const file = new PassThrough();
            this.get(src).pipe(file);
            const fid = String.random(8);
            files[`${fid}.png`] = file;
            ele.setAttribute('src', `file://${fid}.png`);
        });
        const title = document.querySelector('.title').innerHTML.trim().split('. ')[1];
        const time = parseInt(document.querySelector('.time-limit').innerHTML.substr(53, 2), 10);
        const memory = parseInt(document.querySelector('.memory-limit').innerHTML.substr(55, 4), 10);
        document.body.firstChild.remove();
        document.querySelector('.input-specification')?.firstChild.remove();
        document.querySelector('.output-specification')?.firstChild.remove();
        document.querySelector('.note')?.firstChild.remove();
        const input = document.querySelector('.input-specification')?.innerHTML.trim();
        const output = document.querySelector('.output-specification')?.innerHTML.trim();
        const inputs = Array.from(document.querySelectorAll('.input>pre')).map((i) => i.innerHTML.trim().replace(/<br>/g, '\n'));
        const outputs = Array.from(document.querySelectorAll('.output>pre')).map((i) => i.innerHTML.trim().replace(/<br>/g, '\n'));
        const note = document.querySelector('.note')?.innerHTML.trim();
        document.querySelector('.note')?.remove();
        document.querySelector('.sample-tests')?.remove();
        document.querySelectorAll('.section-title').forEach((ele) => {
            const e = document.createElement('h2');
            e.innerHTML = ele.innerHTML;
            ele.replaceWith(e);
        });
        const description = document.body.innerHTML.trim();
        return {
            title: id.startsWith('P921') ? title.replace('1', id.split('P921')[1]) : title,
            data: {
                'config.yaml': Buffer.from(`time: ${time}s\nmemory: ${memory}m\ntype: remote_judge\nsubType: codeforces\ntarget: ${id}`),
            },
            files,
            tag,
            difficulty: getDifficulty(tag),
            content: buildContent([
                {
                    type: 'Text', sectionTitle: 'Description', subType: 'markdown', text: description,
                },
                ...input ? [{
                    type: 'Text', sectionTitle: 'Input', subType: 'markdown', text: input,
                }] : [],
                ...output ? [{
                    type: 'Text', sectionTitle: 'Output', subType: 'markdown', text: output,
                }] : [],
                ...inputs.map((_, i) => ({
                    type: 'Sample', payload: [inputs[i], outputs[i]], text: '', sectionTitle: 'Samples',
                }) as any),
                ...note ? [{
                    type: 'Text', sectionTitle: 'Note', subType: 'markdown', text: note,
                }] : [],
            ]),
        };
    }

    async listProblem(page: number, resync = false) {
        if (resync && page > 1) return [];
        const res = await this.get(`/problemset/page/${page}`);
        const $dom = new JSDOM(res.text);
        const index = $dom.window.document.querySelector('.page-index.active').getAttribute('pageindex');
        if (index !== page.toString()) return [];
        return Array.from($dom.window.document.querySelectorAll('.id>a')).map((i) => `P${i.innerHTML.trim()}`);
    }

    async submitProblem(id: string, lang: string, code: string, info) {
        const programTypeId = lang.includes('codeforces.') ? lang.split('codeforces.')[1] : '54';
        const comment = setting.langs[lang].comment;
        if (comment) {
            const msg = `Hydro submission #${info.rid}@${new Date().getTime()}`;
            if (typeof comment === 'string') code = `${comment} ${msg}\n${code}`;
            else if (comment instanceof Array) code = `${comment[0]} ${msg} ${comment[1]}\n${code}`;
        }
        const [csrf, ftaa, bfaa] = await this.getCsrfToken('/problemset/submit');
        // TODO check submit time to ensure submission
        await this.post(`/problemset/submit?csrf_token=${csrf}`).send({
            csrf_token: csrf,
            action: 'submitSolutionFormSubmitted',
            programTypeId,
            submittedProblemCode: id.split('P')[1],
            source: code,
            tabsize: 4,
            sourceFile: '',
            ftaa,
            bfaa,
            _tta: this.tta(this.getCookie('39ce7')),
            sourceCodeConfirmed: true,
        });
        const { text: status } = await this.get('/problemset/status?my=on');
        const $dom = new JSDOM(status);
        this.csrf = $dom.window.document.querySelector('meta[name="X-Csrf-Token"]').getAttribute('content');
        return $dom.window.document.querySelector('[data-submission-id]').getAttribute('data-submission-id');
    }

    async waitForSubmission(id: string, next, end) {
        let i = 1;
        // eslint-disable-next-line no-constant-condition
        while (true) {
            await sleep(3000);
            const { body } = await this.post('/data/submitSource').send({
                csrf_token: this.csrf,
                submissionId: id,
            });
            if (body.compilationError === 'true') {
                await next({ compilerText: body['checkerStdoutAndStderr#1'] });
                return await end({
                    status: STATUS.STATUS_COMPILE_ERROR, score: 0, time: 0, memory: 0,
                });
            }
            const time = Math.sum(Object.keys(body).filter((k) => k.startsWith('timeConsumed#')).map((k) => +body[k]));
            const memory = Math.max(...Object.keys(body).filter((k) => k.startsWith('memoryConsumed#')).map((k) => +body[k])) / 1024;
            for (; i <= +body.testCount; i++) {
                const status = VERDICT[body[`verdict#${i}`]] || STATUS.STATUS_WRONG_ANSWER;
                await next({
                    status: STATUS.STATUS_JUDGING,
                    case: {
                        id: +i,
                        subtaskId: 1,
                        status,
                        time: +body[`timeConsumed#${i}`],
                        memory: +body[`memoryConsumed#${i}`] / 1024,
                        message: body[`checkerStdoutAndStderr#${i}`] || body[`verdict#${i}`],
                    },
                });
            }
            if (body.waiting === 'true') continue;
            const status = VERDICT[Object.keys(VERDICT).filter((k) => body.verdict.includes(k))[0]];
            return await end({
                status,
                score: status === STATUS.STATUS_ACCEPTED ? 100 : 0,
                time,
                memory,
            });
        }
    }
}
