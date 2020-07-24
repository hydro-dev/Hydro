// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ObjectID, GridFSBucket } from 'mongodb';
import fs from 'fs';
import { Dictionary, NumericDictionary } from 'lodash';

export interface Setting {
    family: string,
    key: string,
    range: Array<[string, string]> | Dictionary<string>,
    value: any,
    type: string,
    name: string,
    desc: string,
    flag: number,
}

export interface Udoc extends Dictionary<any> {
    _id: number,
    mail: string,
    mailLower: string,
    uname: string,
    unameLower: string,
    salt: string,
    hash: string,
    hashType: string,
    priv: number,
    regat: Date,
    loginat: Date,
    regip: string,
    loginip: string,
}

export interface User extends Dictionary<any> {
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
    perm: () => bigint,
    role: string,
    regip: () => string,
    loginip: () => string,
    hasPerm: (perm: bigint) => boolean,
    hasPriv: (priv: number) => boolean,
    checkPassword: (password: string) => void,
}

export type Udict = NumericDictionary<User>;

export interface ProblemDataSource {
    host?: string, // Empty for local
    domainId: string,
    pid: number,
}

// ObjectID for built-in files, ProblemDataSource for other source (RemoteJudge, etc.)
export type ProblemData = ObjectID | ProblemDataSource;

export interface TestCaseConfig {
    input: string,
    output: string,
    time?: number,
    memory?: number,
}

export enum LocalProblemType {
    Default = 'default',
    SubmitAnswer = 'submit_answer',
    Interactive = 'interactive',
}

export enum RemoteProblemType {
    RemoteJudge = 'remotejudge',
}

export enum RemoteServerType {
    vj4 = 'vj4',
    syzoj = 'syzoj',
}

export enum SubtaskType {
    min = 'min',
    max = 'max',
    sum = 'sum',
}

export interface SubtaskConfig {
    time?: number,
    memory?: number,
    score?: number,
    type?: SubtaskType,
    cases?: TestCaseConfig[],
}

export interface LocalProblemConfig {
    type?: LocalProblemType,
    score?: number,
    time?: number,
    memory?: number,
    checker_type?: string,
    checker?: string,
    interactor?: string,
    user_extra_files?: string[],
    judge_extra_files?: string[],
    cases?: TestCaseConfig[],
    subtasks?: SubtaskConfig[],
}

export interface RemoteProblemConfig {
    type?: RemoteProblemType,
    server_type?: RemoteServerType,
    url?: string,
    // TODO handle username&password storage
    pid?: string,
}

export type ProblemConfig = LocalProblemConfig | RemoteProblemConfig;

export interface Pdoc {
    _id: ObjectID,
    domainId: string,
    docType: number,
    docId: number,
    pid: string,
    owner: number,
    title: string,
    content: string,
    nSubmit: number,
    nAccept: number,
    tag: string[],
    category: string[],
    data?: ProblemData,
    hidden: boolean,
    config: ProblemConfig,
    acMsg?: string,
}

export type Pdict = Dictionary<Pdoc>;

export interface TestCase {
    time: number,
    memory: number,
    status: number,
    message: string,
}

export interface PretestConfig {
    time?: number,
    memory?: number,
    input: string,
}

export interface ContestInfo {
    type: number,
    tid: ObjectID,
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
    hidden: boolean,
    config?: PretestConfig,
    contest?: ContestInfo,
}

export interface ScoreboardNode {
    type: string,
    value: string,
    raw?: any,
}

export type PenaltyRules = Dictionary<number>;

export interface Tdoc {
    _id: ObjectID,
    domainId: string,
    docId: ObjectID,
    docType: number,
    owner: number,
    beginAt: Date,
    endAt: Date,
    attend: number,
    title: string,
    content: string,
    rule: string,
    pids: number[],

    // For homework
    penaltySince?: Date,
    penaltyRules?: PenaltyRules,

    // For training
    dag: any
}

export interface DomainDoc extends Dictionary<any> {
    _id: string,
    owner: number,
    roles: Dictionary<string>,
    gravatar: string,
    bulletin: string,
}

// Message
export interface Mdoc {
    _id: ObjectID,
    from: number,
    to: number,
    content: string,
    flag: number,
}

// Userfile
export interface Ufdoc {
    _id: ObjectID,
    secret: string,
    md5: string,
    owner: number,
    size: number,
}

// Blacklist
export interface Bdoc {
    _id: string, // ip
    expireAt: Date,
}

interface ContestStat extends Dictionary<any> {
    detail: any,
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

export type ContestRules = Dictionary<ContestRule>;

export type ProblemImporter = (url: string, handler: any) =>
    Promise<[Pdoc, fs.ReadStream?]> | [Pdoc, fs.ReadStream?];

export interface Script {
    run: (args: any, report: Function) => any,
    description: string,
    validate: any,
}

export interface JudgeResultBody {
    domainId: string,
    rid: ObjectID,
    judger?: number,
    progress?: number
    case?: {
        status: number,
        time: number,
        memory: number,
        message?: string,
    },
    status?: number,
    score?: number,
    time?: number,
    memory?: number,
    message?: string,
    compilerText?: string,

    // For pretest
    stdout?: string,
    stderr?: string,
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
                    testdataConfig: typeof import('./lib/testdataConfig'),
                    sha1: typeof import('./lib/sha1').default,
                    sysinfo: typeof import('./lib/sysinfo'),
                    template: typeof import('./lib/template'),
                    'testdata.convert.ini': typeof import('./lib/testdata.convert.ini').default,
                    useragent: typeof import('./lib/useragent'),
                    validator: typeof import('./lib/validator'),
                    [key: string]: any
                },
                stat: any,
                ui: {
                    manifest: Dict<string>,
                    nav: any,
                    template: { [key: string]: string },
                },
                error: typeof import('./error'),
                locales: Dict<Dict<string>>,
                postInit: Function[],
            },
            onDestory: Function[],
            addons: string[],
        }
    }
}

declare module 'cluster' {
    let isFirstWorker: boolean;
}
