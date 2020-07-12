// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ObjectID, GridFSBucket } from 'mongodb';
import fs from 'fs';

export interface Setting {
    family: string,
    key: string,
    range: Array<[string, string]> | { [key: string]: string },
    value: any,
    type: string,
    name: string,
    desc: string,
    flag: number,
}

export interface Udoc {
    udoc: () => any,
    dudoc: () => any,
    _id: number,
    mail: string,
    uname: string,
    salt: () => string,
    hash: () => string,
    hashType: string,
    priv: number,
    regat: Date,
    loginat: Date,
    perm: string,
    role: string,
    regip: () => string,
    loginip: () => string,
    hasPerm: (perm: string) => boolean,
    hasPriv: (priv: number) => boolean,
    checkPassword: (password: string) => void,
    [key: string]: any,
}

export interface Udict {
    [key: number]: Udoc,
}

export interface Pdoc {
    _id: ObjectID,
    domainId: string,
    docId: number,
    pid: string,
    owner: number,
    title: string,
    content: string,
    nSubmit: number,
    nAccept: number,
    tag: string[],
    category: string[],
    data?: ObjectID,
    hidden: boolean,
    config: string,
}

export interface Pdict {
    [key: string]: Pdoc,
}

export interface TestCase {
    time: number,
    memory: number,
    status: number,
    message: string,
}

export interface Rdoc {
    _id: ObjectID,
    domainId: string,
    pid: number
    uid: number,
    lang: string,
    code: string,
    score: number,
    memory: number,
    time: number,
    judgeTexts: string[],
    compilerTexts: string[],
    testCases: TestCase[],
    rejudged: boolean,
    judger: string,
    judgeAt: Date,
    status: number,
    type: string,
    hidden: boolean,
    input?: string,
    stdout?: string,
    stderr?: string,
    tid?: ObjectID,
    ttype?: number,
}

export interface ScoreboardNode {
    type: string,
    value: string,
    raw?: any,
}

export interface PenaltyRules {
    [key: string]: number,
}

export interface Tdoc {
    _id: ObjectID,
    domainId: string,
    docId: ObjectID,
    docType: number,
    beginAt: Date,
    endAt: Date,
    penaltySince?: Date,
    penaltyRules?: PenaltyRules,
    attend: number,
    title: string,
    content: string,
    rule: string,
    pids: number[],
}

interface ContestStat {
    detail: any,
    [key: string]: any,
}

export interface ContestRule {
    TEXT: string,
    check: (args: any) => any,
    statusSort: any,
    showScoreboard: (tdoc: Tdoc, now: Date) => boolean,
    showRecord: (tdoc: Tdoc, now: Date) => boolean,
    stat: (tdoc: Tdoc, journal: any[]) => ContestStat,
    scoreboard: (
        isExport: boolean, _: (s: string) => string,
        tdoc: Tdoc, rankedTsdocs: any[] | Generator<any>, udict: Udict, pdict: Pdict
    ) => ScoreboardNode[][],
    rank: (tsdocs: any[]) => any[] | Generator<any>,
}

export interface ContestRules {
    [key: string]: ContestRule,
}

export type ProblemImporter = (url: string, handler: any) =>
    Promise<[Pdoc, fs.ReadStream?]> | [Pdoc, fs.ReadStream?];

export interface Script {
    run: (args: any, report: Function) => any,
    description: string,
    validate: any,
}

declare global {
    namespace NodeJS {
        interface Global {
            Hydro: {
                model: {
                    blacklist: typeof import('./model/blacklist'),
                    builtin: typeof import('./model/builtin'),
                    contest: typeof import('./model/contest'),
                    discussion: typeof import('./model/discussion'),
                    document: typeof import('./model/document'),
                    domain: typeof import('./model/domain'),
                    file: typeof import('./model/file'),
                    message: typeof import('./model/message'),
                    opcount: typeof import('./model/opcount'),
                    problem: typeof import('./model/problem'),
                    record: typeof import('./model/record'),
                    setting: typeof import('./model/setting'),
                    solution: typeof import('./model/solution'),
                    system: typeof import('./model/system'),
                    task: typeof import('./model/task'),
                    token: typeof import('./model/token'),
                    training: typeof import('./model/training'),
                    user: typeof import('./model/user'),
                    [key: string]: any,
                },
                handler: { [key: string]: Function },
                script: { [key: string]: Script },
                service: {
                    bus: typeof import('./service/bus'),
                    db: typeof import('./service/db'),
                    gridfs: GridFSBucket,
                    monitor: typeof import('./service/monitor'),
                    server: typeof import('./service/server'),
                },
                lib: {
                    download: typeof import('./lib/download').default,
                    'hash.hydro': typeof import('./lib/hash.hydro').default,
                    hpm: typeof import('./lib/hpm'),
                    i18n: typeof import('./lib/i18n').default,
                    'import.syzoj': typeof import('./lib/import.syzoj').syzoj,
                    jwt: typeof import('./lib/jwt'),
                    logger: typeof import('./lib/logger').default,
                    mail: typeof import('./lib/mail'),
                    markdown: typeof import('./lib/markdown'),
                    md5: typeof import('./lib/md5').default,
                    misc: typeof import('./lib/misc'),
                    nav: typeof import('./lib/nav').default,
                    paginate: typeof import('./lib/paginate').default,
                    rank: typeof import('./lib/rank').default,
                    rating: typeof import('./lib/rating').default,
                    readConfig: typeof import('./lib/readConfig').default,
                    sha1: typeof import('./lib/sha1').default,
                    sysinfo: typeof import('./lib/sysinfo'),
                    template: typeof import('./lib/template'),
                    'testdata.convert.ini': typeof import('./lib/testdata.convert.ini').default,
                    useragent: typeof import('./lib/useragent'),
                    validator: typeof import('./lib/validator'),
                    [key: string]: any
                },
                stat: any,
                wiki: { [category: string]: { [page: string]: any } },
                template: { [key: string]: string },
                ui: any,
                error: typeof import('./error'),
                locales: { [id: string]: { [key: string]: string } },
            },
            nodeModules: any,
            onDestory: Function[],
        }
    }
}

declare module 'cluster' {
    let isFirstWorker: boolean;
}
