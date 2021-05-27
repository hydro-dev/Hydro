import { ItemBucketMetadata } from 'minio';
import type { Readable, Writable } from 'stream';
import type { Cursor, ObjectID } from 'mongodb';
import type fs from 'fs';
import type { Dictionary, NumericDictionary } from 'lodash';
import type * as Koa from 'koa';
import type { ProblemDoc } from './model/problem';

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
    'server.xhost': string,
    'server.worker': number,
    'server.port': number,
    'server.language': string,
    'limit.problem_files_max': number,
    'problem.categories': string,
    'session.keys': string[],
    'session.secure': boolean,
    'session.saved_expire_seconds': number,
    'session.unsaved_expire_seconds': number,
    'user.quota': number,
}

export interface Setting {
    family: string,
    key: string,
    range: [string, string][] | Record<string, string>,
    value: any,
    type: string,
    subType?: string,
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

export type ownerInfo = { owner: number, maintainer?: number[] };

export interface User extends Record<string, any> {
    _id: number,
    _udoc: Udoc,
    _dudoc: any,
    _salt: string,
    _hash: string,
    _regip: string,
    _loginip: string,

    mail: string,
    uname: string,
    hashType: string,
    priv: number,
    regat: Date,
    loginat: Date,
    perm: bigint,
    scope: bigint,
    role: string,
    own<T extends ownerInfo>(doc: T, checkPerm: bigint): boolean
    own<T extends ownerInfo>(doc: T, exact: boolean): boolean
    own<T extends ownerInfo>(doc: T): boolean
    own<T extends { owner: number, maintainer?: number[] }>(doc: T): boolean;
    hasPerm: (...perm: bigint[]) => boolean,
    hasPriv: (...priv: number[]) => boolean,
    checkPassword: (password: string) => void,
}

export type Udict = NumericDictionary<User>;

export interface FileInfo {
    /** duplicate to filename */
    _id: string,
    /** filename */
    name: string,
    /** file size (in bytes) */
    size: number,
    etag: string,
    lastModified: Date,
}

export interface TestCaseConfig {
    input: string,
    output: string,
    time?: number,
    memory?: number,
}

export enum ProblemType {
    Default = 'default',
    SubmitAnswer = 'submit_answer',
    Interactive = 'interactive',
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

export interface ProblemConfigFile {
    type?: ProblemType;
    score?: number;
    time?: string;
    memory?: string;
    filename?: string;
    checker_type?: string;
    checker?: string;
    interactor?: string;
    user_extra_files?: string[];
    judge_extra_files?: string[];
    outputs?: [string, number][];
    cases?: TestCaseConfig[];
    subtasks?: SubtaskConfig[];
    langs?: string[];
}

export interface ProblemConfig {
    count: number;
    memoryMax: number;
    memoryMin: number;
    timeMax: number;
    timeMin: number;
    langs?: string[];
    type: string;
}

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
export type Content = string | ContentNode[] | Record<string, ContentNode[]>;

export interface Document {
    _id: ObjectID;
    docId: any;
    docType: number;
    domainId: string;
    owner: number;
    maintainer?: number[];
}

declare module './model/problem' {
    interface ProblemDoc {
        docType: document['TYPE_PROBLEM'],
        docId: number,
        pid: string,
        title: string,
        content: string,
        nSubmit: number,
        nAccept: number,
        tag: string[],
        data: FileInfo[],
        additional_file: FileInfo[],
        hidden: boolean,
        html?: boolean,
        stats?: any,
        difficulty?: number,
        /** @deprecated */
        category?: string[],

        /** string (errormsg) */
        config: string | ProblemConfig,
    }
}
export type { ProblemDoc } from './model/problem';
export type ProblemDict = NumericDictionary<ProblemDoc>;

export interface StatusDoc {
    _id: ObjectID,
    docId: any,
    docType: number,
    domainId: string,
    uid: number,
}

export interface ProblemStatusDoc extends StatusDoc {
    docId: number;
    docType: 10;
    rid?: ObjectID;
    score?: number;
    status?: number;
    nSubmit?: number;
    nAccept?: number;
    star?: boolean;
}

export interface TestCase {
    time: number,
    memory: number,
    status: number,
    message: string,
}

export interface ContestInfo {
    type: 30 | 60,
    tid: ObjectID,
}

export interface RecordDoc {
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
    input?: string,
    contest?: ContestInfo,
    effective?: boolean,
}

export interface ScoreboardNode {
    type: string;
    value: string;
    raw?: any;
    score?: number;
}
export type ScoreboardRow = ScoreboardNode[] & { raw?: any };

export type PenaltyRules = Dictionary<number>;

export interface TrainingNode {
    _id: number,
    title: string,
    requireNids: number[],
    pids: number[],
}

export interface Tdoc<docType = document['TYPE_CONTEST'] | document['TYPE_HOMEWORK'] | document['TYPE_TRAINING']> extends Document {
    docId: ObjectID,
    docType: docType & number,
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

export interface DomainDoc extends Record<string, any> {
    _id: string,
    owner: number,
    roles: Dictionary<string>,
    avatar: string,
    bulletin: string,
    _join?: any,
    host?: string[],
}

// Message
export interface MessageDoc {
    _id: ObjectID,
    from: number,
    to: number,
    content: string,
    flag: number,
}

// Blacklist
export interface BlacklistDoc {
    /**
     * @example ip:1.1.1.1
     * @example mail:foo.com
     */
    _id: string;
    expireAt: Date;
}

export interface HistoryDoc {
    content: string;
    time: Date;
}

// Discussion
export type { DiscussionDoc } from './model/discussion';
declare module './model/discussion' {
    interface DiscussionDoc {
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
        sort: number,
        lastRCount: number,
    }
}

export interface DiscussionReplyDoc extends Document {
    docType: document['TYPE_DISCUSSION_REPLY'],
    docId: ObjectID,
    parentType: document['TYPE_DISCUSSION'],
    parentId: ObjectID,
    ip: string,
    content: string,
    reply: DiscussionTailReplyDoc[],
    history: HistoryDoc[],
}

export interface DiscussionTailReplyDoc {
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
    TEXT: string;
    check: (args: any) => any;
    statusSort: any;
    showScoreboard: (tdoc: Tdoc<30 | 60>, now: Date) => boolean;
    showRecord: (tdoc: Tdoc<30 | 60>, now: Date) => boolean;
    stat: (tdoc: Tdoc<30 | 60>, journal: any[]) => ContestStat;
    scoreboard: (
        isExport: boolean, _: (s: string) => string,
        tdoc: Tdoc<30 | 60>, pdict: ProblemDict, cursor: Cursor<any>, page: number,
    ) => Promise<[board: ScoreboardRow[], udict: Udict, nPages: number]>;
    ranked: (tdoc: Tdoc<30 | 60>, cursor: Cursor<any>) => Promise<any[]>;
}

export type ContestRules = Dictionary<ContestRule>;
export type ProblemImporter = (url: string, handler: any) => Promise<[ProblemDoc, fs.ReadStream?]> | [ProblemDoc, fs.ReadStream?];

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

export interface BaseService {
    started: boolean;
    error?: Error | string;
    start: Function;
    stop?: Function;
}

export interface FileNode {
    /** File Path In MinIO */
    _id: string
    /** Actual File Path */
    path: string
    lastUsage?: Date
    lastModified?: Date
    etag?: string
    /** Size: in bytes */
    size?: number
    /** AutoDelete */
    autoDelete?: Date
    meta?: ItemBucketMetadata,
}

export interface Collections {
    'blacklist': BlacklistDoc,
    'contest': Tdoc,
    'domain': DomainDoc,
    'domain.user': any,
    'record': RecordDoc,
    'document': any,
    'problem': ProblemDoc,
    'user': Udoc,
    'check': any,
    'message': MessageDoc,
    'token': TokenDoc,
    'status': any,
    'oauth': any,
    'system': System,
    'task': Task,
    'storage': FileNode,
    'oplog': OplogDoc,
    'opcount': any,
    'fs.chunks': any,
    'fs.files': any,
    'document.status': any,
}

export interface Model {
    blacklist: typeof import('./model/blacklist').default,
    builtin: typeof import('./model/builtin'),
    contest: typeof import('./model/contest'),
    discussion: typeof import('./model/discussion'),
    document: typeof import('./model/document'),
    domain: typeof import('./model/domain').default,
    message: typeof import('./model/message').default,
    opcount: typeof import('./model/opcount'),
    problem: typeof import('./model/problem').default,
    record: typeof import('./model/record').default,
    setting: typeof import('./model/setting'),
    solution: typeof import('./model/solution').default,
    system: typeof import('./model/system'),
    task: typeof import('./model/task').default,
    oplog: typeof import('./model/oplog'),
    token: typeof import('./model/token').default,
    training: typeof import('./model/training'),
    user: typeof import('./model/user').default,
    oauth: typeof import('./model/oauth').default,
    storage: typeof import('./model/storage').default,
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

export interface Lib extends Record<string, any> {
    download: typeof import('./lib/download'),
    difficulty: typeof import('./lib/difficulty'),
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
                version: Record<string, string>,
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

declare module 'koa' {
    interface Request extends Koa.BaseRequest {
        body?: any;
        files?: import('formidable').Files;
    }
}
