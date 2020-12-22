import type { Readable, Writable } from 'stream';
import type { ObjectID } from 'mongodb';
import type fs from 'fs';
import type { Dictionary, NumericDictionary } from 'lodash';
import type { Pdoc } from './model/problem';

type document = typeof import('./model/document');

export interface System {
    _id: string,
    value: any,
}

export interface SystemKeys {
    'file.endPoint': string,
    'file.accessKey': string,
    'file.secretKey': string,
    'file.bucket': string,
    'file.region': string,
    'file.endPointForUser': string,
    'file.endPointForJudge': string,
    'smtp.user': string,
    'smtp.from': string,
    'smtp.pass': string,
    'smtp.host': string,
    'smtp.port': number,
    'smtp.secure': boolean,
    'user': number,
    'installid': string,
    'server.name': string,
    'server.url': string,
    'server.xff': string,
    'server.worker': number,
    'server.port': number,
    'session.keys': string[],
    'session.secure': boolean,
    'session.expire_seconds': number,
    'session.unsaved_expire_seconds': number,
    'lostpass_token_expire_seconds': number,
    'registration_token_expire_seconds': number,
    'changemail_token_expire_seconds': number,
    'user.quota': number,
}

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
    udoc: () => Udoc,
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
    scope: () => bigint,
    role: string,
    regip: () => string,
    loginip: () => string,
    hasPerm: (...perm: bigint[]) => boolean,
    hasPriv: (...priv: number[]) => boolean,
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
    time?: string,
    memory?: string,
    filename?: string,
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

export interface PlainContentNode {
    type: 'Plain',
    subType: 'html' | 'markdown',
    text: string,
}
export interface TextContentNode {
    type: 'Text',
    subType: 'html' | 'markdown',
    sectionTitle: string,
    text: string,
}
export interface SampleContentNode {
    type: 'Sample',
    text: string,
    sectionTitle: string,
    payload: [string, string],
}
export type ContentNode = PlainContentNode | TextContentNode | SampleContentNode;
export type Content = string | ContentNode[] | Record<string, ContentNode[]>

declare module './model/problem' {
    interface Pdoc {
        domainId: string,
        docType: 10,
        docId: number,
        pid: string,
        owner: number,
        title: string,
        content: Content,
        nSubmit: number,
        nAccept: number,
        tag: string[],
        category: string[],
        data?: ProblemData,
        hidden: boolean,
        config: ProblemConfig,
        acMsg?: string,
        html?: boolean,

        difficulty?: number,
        difficultyAlgo?: number,
        difficultyAdmin?: number,
        difficultySetting?: any,
    }
}
export type { Pdoc } from './model/problem';
export type Pdict = NumericDictionary<Pdoc>;

export interface StatusDoc {
    _id: ObjectID,
    docId: any,
    docType: number,
    domainId: string,
    uid: number,
}

export interface Document {
    _id: ObjectID,
    docId: any,
    docType: number,
    domainId: string,
    owner: number,
}

export interface ProblemStatusDoc extends StatusDoc {
    docId: number,
    docType: 10,
    rid?: ObjectID,
    status?: number,
    nSubmit?: number,
    nAccept?: number,
    star?: boolean,
}

export interface TestCase {
    time: number,
    memory: number,
    status: number,
    message: string,
}

export interface HackConfig {
    hack: string,
}

export interface PretestConfig {
    time?: string,
    memory?: string,
    input: string,
}

export type RunConfig = HackConfig | PretestConfig;

export interface ContestInfo {
    type: 30 | 60,
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
    judger: number,
    judgeAt: Date,
    status: number,
    hidden: boolean,
    progress?: number,
    config?: RunConfig,
    contest?: ContestInfo,
}

export interface ScoreboardNode {
    type: string,
    value: string,
    raw?: any,
}
export type ScoreboardRow = ScoreboardNode[] & { raw?: any };

export type PenaltyRules = Dictionary<number>;

export interface TrainingNode {
    _id: number,
    title: string,
    requireNids: number[],
    pids: number[],
}

export interface Tdoc extends Document {
    docId: ObjectID,
    docType: document['TYPE_CONTEST'] | document['TYPE_HOMEWORK'] | document['TYPE_TRAINING'],
    beginAt: Date,
    endAt: Date,
    attend: number,
    title: string,
    content: string,
    rule: string,
    pids: number[],
    rated?: boolean,

    // For homework
    penaltySince?: Date,
    penaltyRules?: PenaltyRules,

    // For training
    description?: string,
    dag?: TrainingNode[],
}

export interface TrainingDoc extends Tdoc {
    description: string,
    dag: TrainingNode[],
}

export interface DomainDoc extends Dictionary<any> {
    _id: string,
    owner: number,
    roles: Dictionary<string>,
    gravatar: string,
    bulletin: string,
    pidCounter: number,
    join?: any,
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
    md5?: string,
    owner: number,
    size?: number,
    filename: string,
}

// Blacklist
export interface Bdoc {
    _id: string, // ip
    expireAt: Date,
}

export interface HistoryDoc {
    content: string,
    time: Date,
}

// Discussion
export interface Ddoc extends Document {
    docType: document['TYPE_DISCUSSION'],
    docId: ObjectID,
    parentType: number,
    parentId: ObjectID | number | string,
    title: string,
    content: string,
    ip: string,
    pin: boolean,
    highlight: boolean,
    updateAt: Date,
    nReply: number,
    views: number,
    history: HistoryDoc[],
}

// Discussion reply
export interface Drdoc extends Document {
    docType: document['TYPE_DISCUSSION_REPLY'],
    docId: ObjectID,
    parentType: document['TYPE_DISCUSSION'],
    parentId: ObjectID,
    ip: string,
    content: string,
    reply: Drrdoc[],
    history: HistoryDoc[],
}

// Discussion Tail Reply
export interface Drrdoc {
    _id: ObjectID,
    owner: number,
    content: string,
    ip: string,
    history: HistoryDoc[],
}

export interface TokenDoc {
    _id: string,
    tokenType: number,
    createAt: Date,
    updateAt: Date,
    expireAt: Date,
    [key: string]: any,
}

export interface OplogDoc extends Record<string, any> {
    _id: ObjectID,
    type: string,
}

export interface ContestStat extends Record<string, any> {
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
        tdoc: Tdoc, rankedTsdocs: any[], udict: Udict, pdict: Pdict
    ) => ScoreboardRow[],
    rank: (tsdocs: any[]) => any[],
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

export interface Task {
    _id: ObjectID,
    type: string,
    executeAfter?: Date,
    priority: number,
    [key: string]: any
}

export interface UploadStream extends Writable {
    id: ObjectID
}

export interface HydroFileSystem {
    openUploadStream: (filename: string) => UploadStream
    openDownloadStream: (_id: ObjectID) => Readable
    // TODO
    find: (...args: any[]) => any
}

export type PathComponent = [string, string, Dictionary<any>?, boolean?];

export interface Collections {
    'blacklist': Bdoc,
    'contest': Tdoc,
    'domain': DomainDoc,
    'domain.user': any,
    'record': Rdoc,
    'document': any,
    'problem': Pdoc,
    'user': Udoc,
    'check': any,
    'message': Mdoc,
    'token': TokenDoc,
    'file': Ufdoc,
    'status': any,
    'oauth': any,
    'system': System,
    'task': Task,
    'oplog': OplogDoc,
    'opcount': any,
    'fs.chunks': any,
    'fs.files': any,
    'document.status': any,
}

export interface Model {
    blacklist: typeof import('./model/blacklist'),
    builtin: typeof import('./model/builtin'),
    contest: typeof import('./model/contest'),
    discussion: typeof import('./model/discussion'),
    document: typeof import('./model/document'),
    domain: typeof import('./model/domain'),
    message: typeof import('./model/message'),
    opcount: typeof import('./model/opcount'),
    problem: typeof import('./model/problem'),
    record: typeof import('./model/record'),
    setting: typeof import('./model/setting'),
    solution: typeof import('./model/solution'),
    system: typeof import('./model/system'),
    task: typeof import('./model/task'),
    oplog: typeof import('./model/oplog'),
    token: typeof import('./model/token'),
    training: typeof import('./model/training'),
    user: typeof import('./model/user'),
    oauth: typeof import('./model/oauth'),
}

export interface Service {
    bus: typeof import('./service/bus'),
    db: typeof import('./service/db'),
    fs: HydroFileSystem,
    monitor: typeof import('./service/monitor'),
    server: typeof import('./service/server'),
    storage: typeof import('./service/storage'),
}

interface GeoIP {
    provider: string,
    lookup: (ip: string, locale?: string) => any,
}

export interface Lib {
    download: typeof import('./lib/download'),
    buildContent: typeof import('./lib/content').buildContent,
    'hash.hydro': typeof import('./lib/hash.hydro'),
    i18n: typeof import('./lib/i18n'),
    jwt: typeof import('./lib/jwt'),
    mail: typeof import('./lib/mail'),
    md5: typeof import('./lib/crypto').md5,
    sha1: typeof import('./lib/crypto').sha1,
    misc: typeof import('./lib/misc'),
    paginate: typeof import('./lib/paginate'),
    rank: typeof import('./lib/rank'),
    rating: typeof import('./lib/rating'),
    testdataConfig: typeof import('./lib/testdataConfig'),
    sysinfo: typeof import('./lib/sysinfo'),
    'testdata.convert.ini': typeof import('./lib/testdata.convert.ini'),
    useragent: typeof import('./lib/useragent'),
    validator: typeof import('./lib/validator'),
    template?: any,
    geoip?: GeoIP,
}

export interface UI {
    manifest: Dictionary<string>,
    template: Dictionary<string>,
    nodes: {
        nav: any[],
        problem_add: any[],
        user_dropdown: any[],
    },
    Nav: typeof import('./lib/ui').Nav,
    ProblemAdd: typeof import('./lib/ui').ProblemAdd,
    UserDropdown: typeof import('./lib/ui').UserDropdown,
}

declare global {
    namespace NodeJS {
        interface Global {
            Hydro: {
                model: Model,
                handler: Dict<Function>,
                script: Dict<Script>,
                service: Service,
                lib: Lib,
                stat: any,
                ui: UI,
                error: typeof import('./error'),
                Logger: typeof import('./logger').Logger,
                logger: typeof import('./logger').logger,
                locales: Dict<Dict<string>>,
                isFirstWorker: boolean,
            },
            addons: string[],
        }
    }
}
