/* eslint-disable no-await-in-loop */
import { PassThrough } from 'stream';
import yaml from 'js-yaml';
import { JSDOM } from 'jsdom';
import {
    buildContent, Logger, sleep, STATUS,
} from 'hydrooj';
import { BasicFetcher } from '../fetch';
import { IBasicProvider, RemoteAccount } from '../interface';
import { normalize, VERDICT } from '../verdict';

const logger = new Logger('remote/codeforces');

function parseProblemId(id: string) {
    const [, type, contestId, problemId] = id.startsWith('P921')
        ? ['', 'P', '921', '01']
        : /^(P|GYM)(\d+)([A-Z]+[0-9]*)$/.exec(id);
    if (type === 'GYM' && (+contestId) < 100000) {
        return [type, ((+contestId) + 100000).toString(), problemId];
    }
    return [type, contestId, problemId];
}

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

const sampleParser = (mode: 'input' | 'output') =>
    function parseSample(node: Element, index: number) {
        if (!node.innerHTML.includes('test-example-line')) {
            return `\n
\`\`\`${mode}${index + 1}
${node.innerHTML.trim().replace(/<br>/g, '\n')}
\`\`\`
\n`;
        }
        const lines = [...node.children];
        const highlighted = lines.map((i, l) => [i, l] as [Element, number])
            .filter(([i]) => i.className.includes('odd')).map(([, i]) => i + 1);
        return `\n
\`\`\`${mode}${index + 1}|${highlighted.join(',')}
${lines.map((i) => i.innerHTML).join('\n').trim()}
\`\`\`
\n`;
    };

export default class CodeforcesProvider extends BasicFetcher implements IBasicProvider {
    constructor(public account: RemoteAccount, private save: (data: any) => Promise<void>) {
        super(account, 'https://codeforces.com', 'form', logger);
    }

    csrf: string;

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

    async getCsrfToken(url: string) {
        const { document, html, headers } = await this.html(url);
        if (document.body.children.length < 2 && html.length < 512) {
            throw new Error(document.body.textContent!);
        }
        const ftaa = this.getCookie('70a7c28f3de') || 'n/a';
        const bfaa = this.getCookie('raa') || this.getCookie('bfaa') || 'n/a';
        return [
            (
                document.querySelector('meta[name="X-Csrf-Token"]')
                || document.querySelector('input[name="csrf_token"]')
            )?.getAttribute('content'),
            ftaa, bfaa, headers,
        ];
    }

    get loggedIn() {
        return this.get('/').then((res) => {
            const html = res.text;
            if (html.length < 1000 && html.includes('Redirecting...')) {
                logger.debug('Got a redirect', html);
                return false;
            }
            return html.includes('header-bell__img');
        });
    }

    async ensureLogin() {
        if (await this.loggedIn) return true;
        logger.info('retry normal login');
        const [csrf, ftaa, bfaa, header] = await this.getCsrfToken('/enter');
        if (header['set-cookie']) this.setCookie(header['set-cookie']);
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
            this.setCookie(cookie);
        }
        if (await this.loggedIn) {
            logger.success('Logged in');
            return true;
        }
        return false;
    }

    async getPdfProblem(id: string, meta: Record<string, any>) {
        const [, contestId, problemId] = parseProblemId(id);
        const file = new PassThrough();
        this.get(id.startsWith('GYM')
            ? `/gym/${contestId}/problem/${problemId}`
            : `/problemset/problem/${contestId}/${problemId}`).pipe(file);
        return {
            title: meta.title || '__NO_TITLE__',
            data: {
                'config.yaml': Buffer.from(yaml.dump({
                    ...meta,
                    type: 'remote_judge',
                    subType: 'codeforces',
                    target: id,
                })),
            },
            files: { 'problem.pdf': file },
            tag: [],
            content: '@[pdf](file://problem.pdf?noDisposition=1)',
        };
    }

    async getProblem(id: string, meta: Record<string, any>) {
        logger.info(id);
        if (id === 'P936E') return null; // Problem Missing
        if (id.startsWith('GYM') && !Number.isNaN(Number(id[9]))) return null; // GYM Problem Missing
        const [, contestId, problemId] = parseProblemId(id);
        const res = await this.get(id.startsWith('GYM')
            ? `/gym/${contestId}/problem/${problemId}`
            : `/problemset/problem/${contestId}/${problemId}`);
        if (!res.text) return await this.getPdfProblem(id, meta);
        const $dom = new JSDOM(res.text.replace(/\$\$\$/g, '$'));
        const judgestatement = $dom.window.document.querySelector('html').innerHTML;
        if (['<th>Actions</th>',
            'Statement is not available on English language',
            'ограничение по времени на тест'].find((i) => judgestatement.includes(i))) {
            return null;
        }
        const tag = Array.from($dom.window.document.querySelectorAll('.tag-box')).map((i) => i.textContent.trim());
        const text = $dom.window.document.querySelector('.problem-statement').innerHTML;
        const { window: { document } } = new JSDOM(text);
        const files = {};
        for (const ele of document.querySelectorAll('img[src]')) {
            const src = ele.getAttribute('src');
            if (!src.startsWith('http')) continue;
            const file = new PassThrough();
            this.get(src).pipe(file);
            const fid = String.random(8);
            files[`${fid}.png`] = file;
            ele.setAttribute('src', `file://${fid}.png`);
        }
        const title = document.querySelector('.title').innerHTML.trim().split('. ')[1];
        const time = parseInt(document.querySelector('.time-limit').innerHTML.substr(53, 2), 10);
        const memory = parseInt(document.querySelector('.memory-limit').innerHTML.substr(55, 4), 10);
        document.body.firstChild.remove();
        document.querySelector('.input-specification')?.firstChild.remove();
        document.querySelector('.output-specification')?.firstChild.remove();
        document.querySelector('.note')?.firstChild.remove();
        const input = document.querySelector('.input-specification')?.innerHTML.trim();
        const output = document.querySelector('.output-specification')?.innerHTML.trim();
        const inputs = Array.from(document.querySelectorAll('.input>pre')).map(sampleParser('input'));
        const outputs = Array.from(document.querySelectorAll('.output>pre')).map(sampleParser('output'));
        const note = document.querySelector('.note')?.innerHTML.trim();
        document.querySelector('.note')?.remove();
        document.querySelector('.sample-tests')?.remove();
        for (const ele of document.querySelectorAll('.section-title')) {
            const e = document.createElement('h2');
            e.innerHTML = ele.innerHTML;
            ele.replaceWith(e);
        }
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
                ...inputs.length ? [{
                    type: 'Plain', text: [...inputs, ...outputs].join('\n'),
                }] : [] as any,
                ...note ? [{
                    type: 'Text', sectionTitle: 'Note', subType: 'markdown', text: note,
                }] : [],
            ]),
        };
    }

    // TL;DR; add `gym` to this list to enable codeforces gym
    entryProblemLists = ['main'];
    async listProblem(page: number, resync = false, listName: string) {
        if (resync && page > 1) return [];
        if (resync && listName.startsWith('GYM')) return [];
        if (listName.startsWith('GYM') && page > 1) return [];
        const { document } = await this.html(listName === 'main'
            ? `/problemset/page/${page}`
            : listName === 'gym'
                ? `/gyms/page/${page}`
                : `/gym/${listName.split('GYM')[1]}`,
        );
        if (['gym', 'main'].includes(listName)) {
            const index = document.querySelector('.page-index.active').getAttribute('pageindex');
            if (index !== page.toString()) return [];
        }
        if (listName === 'main') {
            // 1769 is a hidden contest
            return Array.from(document.querySelectorAll('.id>a'))
                .map((i) => `P${i.innerHTML.trim()}`)
                .filter((i) => !['P1772', 'P1769'].find((t) => i.startsWith(t)));
        }
        if (listName === 'gym') {
            return Array.from(document.querySelectorAll('[data-contestId]')).map((i) => `LIST::GYM${i.getAttribute('data-contestId')}`);
        }
        return Array.from(document.querySelectorAll('.id a')).map((i) => {
            const detail = i.parentElement.parentElement.children[1].children[0];
            return `${listName}${i.textContent.trim()}#${JSON.stringify({
                title: detail.children[0].children[0].textContent.trim(),
                time: `${/(\d+m?) *s/.exec(detail.children[1].childNodes[2].textContent)[1]}s`,
                memory: `${/(\d+) *MB/.exec(detail.children[1].childNodes[2].textContent)[1]}m`,
                filename: /(\w+)\.in/.exec(detail.children[1].textContent)?.[1],
            })}`;
        });
    }

    async submitProblem(id: string, lang: string, code: string, info, next, end) {
        const programTypeId = lang.includes('codeforces.') ? lang.split('codeforces.')[1] : '54';
        const [type, contestId, problemId] = parseProblemId(id);
        const endpoint = type === 'GYM'
            ? `/gym/${contestId}/submit`
            : `/problemset/submit/${contestId}/${problemId}`;
        const [csrf, ftaa, bfaa] = await this.getCsrfToken(endpoint);
        // TODO check submit time to ensure submission
        const { text: submit, redirects } = await this.post(`${endpoint}?csrf_token=${csrf}`).send({
            csrf_token: csrf,
            action: 'submitSolutionFormSubmitted',
            programTypeId,
            source: code,
            tabSize: 4,
            sourceFile: '',
            ftaa,
            bfaa,
            _tta: this.tta(this.getCookie('39ce7')),
            contestId,
            submittedProblemIndex: problemId,
        });
        const { window: { document: statusDocument } } = new JSDOM(submit);
        const message = Array.from(statusDocument.querySelectorAll('.error'))
            .map((i) => i.textContent).join('').replace(/&nbsp;/g, ' ').trim();
        if (message) {
            end({ status: STATUS.STATUS_SYSTEM_ERROR, message });
            return null;
        }
        if (redirects.length === 0 || !redirects.toString().includes('my')) {
            // Submit failed so the request is not redirected
            end({ status: STATUS.STATUS_SYSTEM_ERROR, message: 'Submit failed' });
            return null;
        }
        const { document } = await this.html(type !== 'GYM'
            ? '/problemset/status?my=on'
            : `/gym/${contestId}/my`);
        this.csrf = document.querySelector('meta[name="X-Csrf-Token"]').getAttribute('content');
        const submission = document.querySelector('[data-submission-id]').getAttribute('data-submission-id');
        return type !== 'GYM' ? submission : `${contestId}#${submission}`;
    }

    async waitForSubmission(id: string, next, end) {
        let i = 1;
        const start = Date.now();
        // eslint-disable-next-line no-constant-condition
        while (true) {
            await sleep(3000);
            const contestId = id.includes('#') ? id.split('#')[0] : null;
            const { body } = await this.post('/data/submitSource')
                .set('referer', contestId ? `https://codeforces.com/gym/${contestId}/my` : 'https://codeforces.com/problemset/status?my=on')
                .send({
                    csrf_token: this.csrf,
                    submissionId: contestId ? id.split('#')[1] : id,
                });
            if (body.compilationError === 'true') {
                await end({
                    compilerText: body['checkerStdoutAndStderr#1'],
                    status: STATUS.STATUS_COMPILE_ERROR,
                    score: 0,
                    time: 0,
                    memory: 0,
                });
                break;
            }
            const time = Math.sum(Object.keys(body).filter((k) => k.startsWith('timeConsumed#')).map((k) => +body[k]));
            const memory = Math.max(...Object.keys(body).filter((k) => k.startsWith('memoryConsumed#')).map((k) => +body[k])) / 1024;
            const cases = [];
            for (; i <= +body.testCount; i++) {
                const status = VERDICT[body[`verdict#${i}`]] || STATUS.STATUS_WRONG_ANSWER;
                cases.push({
                    id: +i,
                    subtaskId: 1,
                    status,
                    time: +body[`timeConsumed#${i}`],
                    memory: +body[`memoryConsumed#${i}`] / 1024,
                    message: body[`checkerStdoutAndStderr#${i}`] || body[`verdict#${i}`],
                });
            }
            if (cases.length) await next({ status: STATUS.STATUS_JUDGING, cases });
            if (body.waiting === 'true') continue;
            const status = VERDICT[Object.keys(VERDICT).find((k) => normalize(body.verdict).includes(k))];
            await end({
                status,
                score: status === STATUS.STATUS_ACCEPTED ? 100 : 0,
                time,
                memory,
            });
            break;
        }
        // TODO better rate limiting
        // Codeforces only allow 20 submission per 5 minute
        if (Date.now() - start < 16000) await sleep(Date.now() - start);
    }
}
