import {
    _, Logger, sleep, STATUS,
} from 'hydrooj';
import { BasicFetcher } from '../fetch';
import { IBasicProvider, RemoteAccount } from '../interface';
import { VERDICT } from '../verdict';

// NOTE: This is no longer under maintenance.
//       You may find it just works, or you may not.
//       Feel free to open a pull request if you want to fix any issue.

/* eslint-disable no-await-in-loop */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.163 Safari/537.36';
const logger = new Logger('vjudge/hustoj');

interface HustOJRemoteConfig {
    login?: {
        endpoint?: string;
        usernameField?: string;
        passwordField?: string;
        extra?: Record<string, string>;
    };
    // NOTE: CAPTCHAS ARE NOT SUPPORTED
    submit?: {
        endpoint?: string;
        idField?: string;
        langField?: string;
        codeField?: string;
        extra?: Record<string, string>;
        tooFrequent?: string;
        rid?: RegExp;
    };
    monit?: {
        endpoint?: string;
    };
    ceInfo?: {
        endpoint?: string;
        matcher?: RegExp;
    },
    server?: string;
}

const defaultConfig: HustOJRemoteConfig = {
    // languages: {
    //     c: 0,
    //     cc: 1,
    //     pas: 2,
    //     java: 3,
    //     rb: 4,
    //     sh: 5,
    //     py: 6,
    //     php: 7,
    //     pl: 8,
    //     cs: 9,
    //     js: 16,
    //     go: 17,
    // },
    ceInfo: {
        endpoint: '/ceinfo.php?sid={rid}',
        matcher: /<pre class=".*?" id='errtxt' >(.*?)<\/pre>/gmi,
    },
    monit: {
        endpoint: '/status.php?pid={pid}&user_id={uid}',
    },
    login: {
        endpoint: '/login.php',
        usernameField: 'username',
        passwordField: 'password',
        extra: {},
    },
    submit: {
        endpoint: '/submit.php',
        idField: 'id',
        langField: 'language',
        codeField: 'source',
        extra: {},
        tooFrequent: 'UNKNOWN',
        rid: /<tbody>\n<tr class="evenrow"><td>([0-9]+)<\/td>/gmi,
    },
    server: 'https://acm.hust.edu.cn',
};

function isProcessing(t: string) {
    return [STATUS.STATUS_WAITING, STATUS.STATUS_COMPILING, STATUS.STATUS_JUDGING].includes(VERDICT[t]);
}

export class HUSTOJ extends BasicFetcher implements IBasicProvider {
    config: HustOJRemoteConfig;
    state = {
        username: '',
        pid: '',
    };

    constructor(public account: RemoteAccount, private save: (data: any) => Promise<void>) {
        const config = _.defaultsDeep({ ...defaultConfig }, account);
        super(account, '', 'form', logger, {
            post: {
                headers: {
                    Referer: config.server,
                    'User-Agent': UA,
                    Accept: 'application/json',
                },
            },
        });
        this.config = config;
        this.updateConfig();
    }

    updateConfig() { }

    getProblem() {
        return null;
    }

    async listProblem() {
        return [];
    }

    async login(username: string, password: string) {
        this.cookie = [];
        const res = await this.post(this.config.login[0]).send({
            [this.config.login.usernameField]: username,
            [this.config.login.passwordField]: password,
            ...this.config.login.extra,
        });
        this.state.username = username;
        this.cookie = res.headers['set-cookie'].join('\n');
    }

    async ensureLogin() {
        if (!this.account.handle || !this.account.password) return false;
        await this.login(this.account.handle, this.account.password);
        return true;
    }

    async submitProblem(id: string, lang: string, code: string, info, next) {
        const res = await this.post(this.config.submit.endpoint).send({
            [this.config.submit.idField]: id,
            [this.config.submit.langField]: lang.split('.')[1],
            [this.config.submit.codeField]: code,
            ...this.config.submit.extra,
        });
        // if (res.text.includes(this.config.submit.tooFrequent)) throw new TooFrequentError();
        console.log(res.text);
        const url = this.config.monit.endpoint.replace('{uid}', this.state.username).replace('{pid}', id);
        this.state.pid = id;
        const r = await this.get(url);
        next({ message: `ID: ${this.config.submit.rid.exec(r.text)[1]}` });
        return this.config.submit.rid.exec(r.text)[1];
    }

    async waitForSubmission(rid, next, end) {
        let url = this.config.monit.endpoint.replace('{uid}', this.state.username).replace('{pid}', this.state.pid);
        // eslint-disable-next-line max-len
        const RE = new RegExp(`<tr.*?class="evenrow".*?><td>${rid}</td>.*?</td><td>.*?</td><td><font color=".*?">(.*?)</font></td><td>(.*?)<font color="red">kb</font></td><td>(.*?)<font color="red">ms`, 'gmi');
        const res = await this.get(url);
        let [, status, time, memory] = RE.exec(res.text);
        while (isProcessing(status)) {
            next({ status: STATUS.STATUS_JUDGING, progress: 0 });
            await sleep(1000);
            const resp = await this.get(url);
            [, status, time, memory] = RE.exec(resp.text);
        }
        if (VERDICT[status] === STATUS.STATUS_COMPILE_ERROR) {
            url = this.config.ceInfo.endpoint.replace('{rid}', rid);
            const resp = await this.get(url);
            const compilerText = decodeURIComponent(this.config.ceInfo.matcher.exec(resp.text)[1]
                ?.replace(/\n/g, '')?.replace(/<br\/>/g, '\n')?.replace(/\n\n/g, '\n'));
            end({
                status: STATUS.STATUS_COMPILE_ERROR,
                score: 0,
                time: 0,
                memory: 0,
                compilerText,
            });
            return;
        }
        const score = VERDICT[status] === STATUS.STATUS_ACCEPTED ? 100 : 0;
        next({
            status: STATUS.STATUS_JUDGING,
            case: {
                status: VERDICT[status],
                score,
                time: +time,
                memory: +memory,
                message: status,
            },
            progress: 99,
        });
        end({
            status: VERDICT[status],
            score,
            time: +time,
            memory: +memory,
            message: status,
        });
    }
}

export class YBT extends HUSTOJ {
    updateConfig() {
        // this.LANGUAGES = {
        //     cc: 1,
        //     c: 2,
        //     java: 3,
        //     pas: 4,
        //     py: 5,
        //     py3: 5,
        // };
        this.config.login.extra = { login: '登录' };
        this.config.submit = {
            endpoint: '/action.php',
            idField: 'problem_id',
            langField: 'language',
            codeField: 'source',
            extra: { submit: '提交', user_id: this.account.handle },
            tooFrequent: '提交频繁啦！',
        };
        this.config.ceInfo = {
            endpoint: '/show_ce_info.php?runid={rid}',
            matcher: /<td class="ceinfo">(.*?)<\/td>/gmi,
        };
        this.config.server = 'http://ybt.ssoier.cn:8088/';
    }

    async waitForSubmission(rid, next, end) {
        const url = `/statusx1.php?runidx=${rid}`;
        let res = await this.get(url);
        let staText = res.text.split(':');
        while (isProcessing(staText[4])) {
            next({ status: STATUS.STATUS_JUDGING, progress: 0 });
            await sleep(1000);
            res = await this.get(url);
            staText = res.text.split(':');
        }
        if (VERDICT[staText[4]] === STATUS.STATUS_COMPILE_ERROR) {
            const ceInfoUrl = this.config.ceInfo.endpoint.replace('{rid}', rid);
            const resp = await this.get(ceInfoUrl);
            const compilerText = decodeURIComponent(this.config.ceInfo.matcher.exec(resp.text)[1]
                .replace('\n', '').replace('<br/>', '\n').replace('\n\n', '\n'));
            end({
                status: STATUS.STATUS_COMPILE_ERROR,
                score: 0,
                time: 0,
                memory: 0,
                compilerText,
            });
            return;
        }
        const staText4 = staText[4].split('|');
        const staText5 = staText[5].split(',');
        let totalTime = 0;
        let totalMem = 0;
        let totalScore = 0;
        let totalStatus = STATUS.STATUS_WRONG_ANSWER;
        for (const i in staText5) {
            if (staText5[i]) {
                let score;
                const staText5i = staText5[i].split('|');
                if (VERDICT[staText5i[0]] === STATUS.STATUS_ACCEPTED) {
                    score = 100;
                    totalScore += score;
                } else score = 0;
                const staText5i1 = staText5i[1].split('_');
                totalMem += +staText5i1[0];
                totalTime += +staText5i1[1];
                next({
                    status: STATUS.STATUS_JUDGING,
                    case: {
                        status: VERDICT[staText5i[0]],
                        score,
                        time: +staText5i1[1],
                        memory: +staText5i1[0],
                    },
                    progress: 99,
                });
            }
        }
        if (VERDICT[staText4[0]] === STATUS.STATUS_ACCEPTED) {
            totalScore = 100;
            totalStatus = STATUS.STATUS_ACCEPTED;
        }
        end({
            status: totalStatus,
            score: totalScore,
            time: totalTime,
            memory: totalMem,
        });
    }
}

export class BZOJ extends HUSTOJ {
    updateConfig() {
        this.config.login = {
            endpoint: '/login.php',
            usernameField: 'user_id',
            passwordField: 'password',
            extra: { submit: 'Submit' },
        };
        this.config.submit.tooFrequent = 'You should not submit more than twice in 10 seconds.....';
        this.config.submit.rid = /Submit_Time<\/td><\/tr>\n<tr align="center" class="evenrow"><td>([0-9]+)/igm;
        this.config.ceInfo.matcher = /<pre>([\s\S]*?)<\/pre>/igm;
    }
}

export class XJOI extends HUSTOJ {
    updateConfig() {
        // this.LANGUAGES = { cc: 'g++', c: 'gcc', pas: 'fpc' };
        this.config.login = {
            endpoint: '/',
            usernameField: 'user',
            passwordField: 'pass',
            extra: { remember: 'on' },
        };
        this.config.submit = {
            endpoint: '/submit',
            idField: 'proid',
            langField: 'language',
            codeField: 'source',
            tooFrequent: '请稍后再提交',
            extra: {},
            rid: /<tr class="table-bordered"><td class="status-table-text"> <a href="\/detail\/([0-9]+)"/igm,
        };
    }

    async waitForSubmission(rid, next, end) {
        const SUPERMONIT = [
            /<textarea .*?>([\s\S]*?)<\/textarea>/igm,
            /time: ([0-9]+)ms, memory: ([0-9]+)kb, points: ([0-9]+), status: (.*?)/gmi,
        ];
        const url = `/detail${rid}`;
        let res = await this.get(url);
        let msg = SUPERMONIT[0].exec(res.text)[1].split('\n');
        while (isProcessing(msg[0])) {
            await sleep(1000);
            res = await this.get(url);
            msg = SUPERMONIT[1].exec(res.text)[1].split('\n');
        }
        if (VERDICT[msg[0]] === STATUS.STATUS_COMPILE_ERROR) {
            end({
                status: STATUS.STATUS_COMPILE_ERROR,
                score: 0,
                time: 0,
                memory: 0,
                compilerText: msg.join('\n'),
            });
            return;
        }
        for (let i = 2; i < msg.length - 1; i++) {
            const [, time, memory, score, status] = SUPERMONIT[1].exec(msg[i]);
            next({
                status: STATUS.STATUS_JUDGING,
                case: {
                    time: +time,
                    memory: +memory,
                    score: +score,
                    status: VERDICT[status],
                },
            });
        }
        const [, time, memory, score, status] = SUPERMONIT[1].exec(msg[1]);
        end({
            time: +time,
            memory: +memory,
            score: +score,
            status: VERDICT[status],
        });
    }
}
