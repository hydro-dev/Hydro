/* eslint-disable perfectionist/sort-exports */
import type { AttestationFormat, CredentialDeviceType } from '@simplewebauthn/server';
import type { ParsedAuthenticatorData } from '@simplewebauthn/server/helpers';
import type fs from 'fs';
import type { Dictionary, NumericDictionary } from 'lodash';
import type { Binary, FindCursor, ObjectId } from 'mongodb';
import type {
    FileInfo, RecordJudgeInfo, RecordPayload,
} from '@hydrooj/common/types';
import type { Context } from './context';
import type { PrintTaskStatus } from './model/contest';
import type { DocStatusType } from './model/document';
import type { OauthMap } from './model/oauth';
import type { ProblemDoc } from './model/problem';

export * from '@hydrooj/common/types';

type document = typeof import('./model/document');

export interface System {
    _id: string;
    value: any;
}

export interface SystemKeys {
    'smtp.user': string;
    'smtp.from': string;
    'smtp.pass': string;
    'smtp.host': string;
    'smtp.port': number;
    'smtp.secure': boolean;
    installid: string;
    'server.name': string;
    'server.url': string;
    'server.xff': string;
    'server.xhost': string;
    'server.host': string;
    'server.port': number;
    'server.language': string;
    'limit.problem_files_max': number;
    'problem.categories': string;
    'session.keys': string[];
    'session.saved_expire_seconds': number;
    'session.unsaved_expire_seconds': number;
    'user.quota': number;
}

export interface Setting {
    family: string;
    key: string;
    range: [string, string][] | Record<string, string>;
    value: any;
    type: string;
    subType?: string;
    name: string;
    desc: string;
    flag: number;
    validation?: (val: any) => boolean;
}

export interface Authenticator {
    name: string;
    regat: number;

    fmt: AttestationFormat;
    counter: number;
    aaguid: string;
    credentialID: Binary;
    credentialPublicKey: Binary;
    credentialType: 'public-key';
    attestationObject: Binary;
    userVerified: boolean;
    credentialDeviceType: CredentialDeviceType;
    credentialBackedUp: boolean;
    authenticatorExtensionResults?: ParsedAuthenticatorData['extensionsData'];
    authenticatorAttachment: 'platform' | 'cross-platform';
}

export interface Udoc extends Record<string, any> {
    _id: number;
    mail: string;
    mailLower: string;
    uname: string;
    unameLower: string;
    salt: string;
    hash: string;
    hashType: string;
    priv: number;
    regat: Date;
    loginat: Date;
    ip: string[];
    loginip: string;
}

export interface VUdoc {
    _id: number;
    mail: string;
    mailLower: string;
    uname: string;
    unameLower: string;
    salt: '';
    hash: '';
    hashType: 'hydro';
    priv: 0;
    regat: Date;
    loginat: Date;
    ip: ['127.0.0.1'];
    loginip: '127.0.0.1';
}

export interface GDoc {
    _id: ObjectId;
    domainId: string;
    name: string;
    uids: number[];
}

export interface UserPreferenceDoc {
    _id: ObjectId;
    filename: string;
    uid: number;
    content: string;
}

export interface OwnerInfo { owner: number, maintainer?: number[] }

export type User = import('./model/user').User;
export type Udict = Record<number, User>;

export interface BaseUser {
    _id: number;
    uname: string;
    mail: string;
    avatar: string;
    school?: string;
    displayName?: string;
    studentId?: string;
}
export type BaseUserDict = Record<number, BaseUser>;

export interface ProblemConfig {
    redirect?: [string, string];
    count: number;
    memoryMax: number;
    memoryMin: number;
    timeMax: number;
    timeMin: number;
    langs?: string[];
    type: string;
    subType?: string;
    target?: string;
    hackable?: boolean;
}

export type Content = string | Record<string, string>;

export interface Document {
    _id: ObjectId;
    docId: any;
    docType: number;
    domainId: string;
    owner: number;
    maintainer?: number[];
}

declare module './model/problem' {
    interface ProblemDoc {
        docType: document['TYPE_PROBLEM'];
        docId: number;
        pid: string;
        title: string;
        content: string;
        nSubmit: number;
        nAccept: number;
        tag: string[];
        data: FileInfo[];
        additional_file: FileInfo[];
        hidden?: boolean;
        html?: boolean;
        stats?: any;
        difficulty?: number;
        sort?: string;
        reference?: {
            domainId: string;
            pid: number;
        };

        /** string (errormsg) */
        config: string | ProblemConfig;
    }
}
export type { ProblemDoc } from './model/problem';
export type ProblemDict = NumericDictionary<ProblemDoc>;

export interface StatusDocBase {
    _id: ObjectId;
    docId: any;
    docType: number;
    domainId: string;
    uid: number;
}

export interface ProblemStatusDoc extends StatusDocBase {
    docId: number;
    docType: 10;
    rid?: ObjectId;
    score?: number;
    status?: number;
    star?: boolean;
}

export type RecordDoc = {
    [K in keyof RecordPayload]: K extends 'hackTarget' | 'contest' ? ObjectId : RecordPayload[K];
} & {
    _id: ObjectId;
};

export interface RecordHistoryDoc extends RecordJudgeInfo {
    _id: ObjectId;
    rid: ObjectId;
}

export interface RecordStatDoc {
    _id: ObjectId;
    domainId: string;
    pid: number;
    uid: number;
    time: number;
    memory: number;
    length: number;
    lang: string;
}

export interface ScoreboardNode {
    type: 'string' | 'rank' | 'user' | 'email' | 'record' | 'records' | 'problem' | 'solved' | 'time' | 'total_score';
    value: string; // 显示分数
    raw?: any;
    score?: number; // 原始分数（100，不含赛制加成）
    style?: string;
    hover?: string;
}
export type ScoreboardRow = ScoreboardNode[] & { raw?: any };

export type PenaltyRules = Dictionary<number>;

export interface TrainingNode {
    _id: number;
    title: string;
    requireNids: number[];
    pids: number[];
}

export interface Tdoc extends Document {
    docId: ObjectId;
    docType: document['TYPE_CONTEST'];
    beginAt: Date;
    endAt: Date;
    attend: number;
    title: string;
    content: string;
    rule: string;
    pids: number[];
    rated?: boolean;
    _code?: string;
    assign?: string[];
    files?: FileInfo[];
    privateFiles?: FileInfo[];
    allowViewCode?: boolean;
    allowPrint?: boolean;

    // For contest
    lockAt?: Date;
    unlocked?: boolean;
    autoHide?: boolean;
    balloon?: Record<number, string | { color: string, name: string }>;
    score?: Record<number, number>;
    langs?: string[];

    /**
     * In hours
     * 在比赛有效时间内选择特定的 X 小时参加比赛（从首次打开比赛算起）
     */
    duration: number;

    // For homework
    penaltySince?: Date;
    penaltyRules?: PenaltyRules;

    // For training
    description?: string;
    dag?: TrainingNode[];
}

export interface TrainingDoc extends Omit<Tdoc, 'docType'> {
    docType: document['TYPE_TRAINING'];
    description: string;
    pin?: number;
    dag: TrainingNode[];
}

export interface DomainDoc extends Record<string, any> {
    _id: string;
    owner: number;
    roles: Dictionary<string>;
    avatar: string;
    bulletin: string;
    _join?: any;
    host?: string[];
}

// Message
export interface MessageDoc {
    from: number;
    to: number | number[];
    content: string;
    flag: number;
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

// Discussion
export type { DiscussionDoc } from './model/discussion';
declare module './model/discussion' {
    interface DiscussionDoc {
        docType: document['TYPE_DISCUSSION'];
        docId: ObjectId;
        parentType: number;
        parentId: ObjectId | number | string;
        title: string;
        content: string;
        ip: string;
        pin: boolean;
        highlight: boolean;
        updateAt: Date;
        nReply: number;
        views: number;
        edited?: boolean;
        editor?: number;
        react: Record<string, number>;
        sort: number;
        lastRCount: number;
        lock?: boolean;
        hidden?: boolean;
    }
}

export interface DiscussionReplyDoc extends Document {
    docType: document['TYPE_DISCUSSION_REPLY'];
    docId: ObjectId;
    parentType: document['TYPE_DISCUSSION'];
    parentId: ObjectId;
    ip: string;
    content: string;
    reply: DiscussionTailReplyDoc[];
    edited?: boolean;
    editor?: number;
    react: Record<string, number>;
}

export interface DiscussionTailReplyDoc {
    _id: ObjectId;
    owner: number;
    content: string;
    ip: string;
    edited?: boolean;
    editor?: number;
}

export interface ContestClarificationDoc extends Document {
    docType: document['TYPE_CONTEST_CLARIFICATION'];
    docId: ObjectId;
    parentType: document['TYPE_CONTEST'];
    parentId: ObjectId;
    // 0: contest -1: technique [pid]: problem
    subject: number;
    ip: string;
    content: string;
    reply: DiscussionTailReplyDoc[];
}

export interface ContestPrintDoc extends Document {
    docType: document['TYPE_CONTEST_PRINT'];
    docId: ObjectId;
    parentType: document['TYPE_CONTEST'];
    parentId: ObjectId;
    title: string;
    content: string;
    status: PrintTaskStatus;
}

export interface TokenDoc {
    _id: string;
    tokenType: number;
    createAt: Date;
    updateAt: Date;
    expireAt: Date;
    [key: string]: any;
}

export interface OplogDoc extends Record<string, any> {
    _id: ObjectId;
    type: string;
}

export interface ContestStat extends Record<string, any> {
    detail: Record<number, Record<string, any>>;
    unrank?: boolean;
}

export interface ScoreboardConfig {
    isExport: boolean;
    showDisplayName: boolean;
    lockAt?: Date;
}

export interface ContestRule<T = any> {
    _originalRule?: Partial<ContestRule<T>>;
    TEXT: string;
    hidden?: boolean;
    check: (args: any) => any;
    statusSort: Record<string, 1 | -1>;
    submitAfterAccept: boolean;
    showScoreboard: (tdoc: Tdoc, now: Date) => boolean;
    showSelfRecord: (tdoc: Tdoc, now: Date) => boolean;
    showRecord: (tdoc: Tdoc, now: Date) => boolean;
    stat: (this: ContestRule<T>, tdoc: Tdoc, journal: any[]) => ContestStat & T;
    scoreboardHeader: (
        this: ContestRule<T>, config: ScoreboardConfig, _: (s: string) => string,
        tdoc: Tdoc, pdict: ProblemDict,
    ) => Promise<ScoreboardRow>;
    scoreboardRow: (
        this: ContestRule<T>, config: ScoreboardConfig, _: (s: string) => string,
        tdoc: Tdoc, pdict: ProblemDict, udoc: BaseUser, rank: number, tsdoc: ContestStat & T,
        meta?: any,
    ) => Promise<ScoreboardRow>;
    scoreboard: (
        this: ContestRule<T>, config: ScoreboardConfig, _: (s: string) => string,
        tdoc: Tdoc, pdict: ProblemDict, cursor: FindCursor<ContestStat & T>,
    ) => Promise<[board: ScoreboardRow[], udict: BaseUserDict]>;
    ranked: (tdoc: Tdoc, cursor: FindCursor<ContestStat & T>) => Promise<[number, ContestStat & T][]>;
    applyProjection: (tdoc: Tdoc, rdoc: RecordDoc, user: User) => RecordDoc;
}

export type ContestRules = Dictionary<ContestRule>;
export type ProblemImporter = (url: string, handler: any) => Promise<[ProblemDoc, fs.ReadStream?]> | [ProblemDoc, fs.ReadStream?];

export interface Script {
    run: (args: any, report: Function) => any;
    description: string;
    validate: any;
}

export interface Task {
    _id: ObjectId;
    type: string;
    subType?: string;
    priority: number;
    [key: string]: any;
}

export interface Schedule {
    _id: ObjectId;
    type: string;
    subType?: string;
    executeAfter: Date;
    [key: string]: any;
}

export interface FileNode {
    /** File Path In S3 */
    _id: string;
    /** Actual File Path */
    path: string;
    lastUsage?: Date;
    lastModified?: Date;
    etag?: string;
    /** Size: in bytes */
    size?: number;
    /** AutoDelete */
    autoDelete?: Date;
    /** fileId if linked to an existing file */
    link?: string;
    owner?: number;
    operator?: number[];
    meta?: Record<string, string | number>;
}

export interface EventDoc {
    ack: string[];
    event: number | string;
    payload: string;
    expire: Date;
    trace?: string;
}

export interface OpCountDoc {
    _id: ObjectId;
    op: string;
    ident: string;
    expireAt: Date;
    opcount: number;
}

export type { OauthMap, OAuthProvider, OAuthUserResponse } from './model/oauth';

export interface DiscussionHistoryDoc {
    title?: string;
    content: string;
    domainId: string;
    docId: ObjectId;
    /** Create time */
    time: Date;
    uid: number;
    ip: string;
}

export interface ContestBalloonDoc {
    _id: ObjectId;
    domainId: string;
    tid: ObjectId;
    pid: number;
    uid: number;
    first?: boolean;
    /** Sent by */
    sent?: number;
    sentAt?: Date;
}

export interface LockDoc {
    _id: ObjectId;
    key: string;
    lockAt: Date;
    daemonId: string;
}

declare module './service/db' {
    interface Collections {
        blacklist: BlacklistDoc;
        domain: DomainDoc;
        'domain.user': any;
        record: RecordDoc;
        'record.stat': RecordStatDoc;
        'record.history': RecordHistoryDoc;
        document: any;
        'document.status': StatusDocBase & {
            [K in keyof DocStatusType]: { docType: K } & DocStatusType[K];
        }[keyof DocStatusType];
        'discussion.history': DiscussionHistoryDoc;
        user: Udoc;
        'user.preference': UserPreferenceDoc;
        vuser: VUdoc;
        'user.group': GDoc;
        check: System;
        message: MessageDoc;
        token: TokenDoc;
        status: any;
        oauth: OauthMap;
        system: System;
        task: Task;
        storage: FileNode;
        oplog: OplogDoc;
        event: EventDoc;
        opcount: OpCountDoc;
        schedule: Schedule;
        'contest.balloon': ContestBalloonDoc;
        lock: LockDoc;
    }
}

export interface Model {
    blacklist: typeof import('./model/blacklist').default;
    builtin: typeof import('./model/builtin');
    contest: typeof import('./model/contest');
    discussion: typeof import('./model/discussion');
    document: Omit<typeof import('./model/document'), 'apply'>;
    domain: typeof import('./model/domain').default;
    message: typeof import('./model/message').default;
    opcount: typeof import('./model/opcount');
    problem: typeof import('./model/problem').default;
    record: typeof import('./model/record').default;
    setting: typeof import('./model/setting');
    solution: typeof import('./model/solution').default;
    system: typeof import('./model/system').default;
    task: typeof import('./model/task').default;
    schedule: typeof import('./model/schedule').default;
    oplog: typeof import('./model/oplog');
    token: typeof import('./model/token').default;
    training: typeof import('./model/training');
    user: typeof import('./model/user').default;
    oauth: typeof import('./model/oauth').default;
    storage: typeof import('./model/storage').default;
    rp: typeof import('./script/rating').RpTypes;
}

export interface GeoIP {
    provider: string;
    lookup: (ip: string, locale?: string) => any;
}

export interface ProblemSearchResponse {
    hits: string[];
    total: number;
    countRelation: 'eq' | 'gte';
}
export interface ProblemSearchOptions {
    limit?: number;
    skip?: number;
}

export type ProblemSearch = (domainId: string, q: string, options?: ProblemSearchOptions) => Promise<ProblemSearchResponse>;

export type UIInjectableFields = 'ProblemAdd' | 'Notification' | 'Nav' | 'UserDropdown' | 'DomainManage' | 'ControlPanel';
export interface UI {
    nodes: Record<UIInjectableFields, any[]>;
    getNodes: typeof import('./lib/ui').getNodes;
    inject: typeof import('./lib/ui').inject;
}

export interface ModuleInterfaces {
    hash: (password: string, salt: string, user: User) => boolean | string | Promise<string>;
    problemSearch: ProblemSearch;
}

export interface HydroGlobal {
    version: Record<string, string>;
    model: Model;
    script: Record<string, Script>;
    module: { [K in keyof ModuleInterfaces]: Record<string, ModuleInterfaces[K]> };
    ui: UI;
    error: typeof import('./error');
    Logger: typeof import('./logger').Logger;
    logger: typeof import('./logger').logger;
    locales: Record<string, Record<string, string> & Record<symbol, Record<string, string>>>;
}

declare global {
    namespace NodeJS {
        interface Global {
            Hydro: HydroGlobal;
            addons: string[];
        }
    }
    /** @deprecated */
    var bus: Context; // eslint-disable-line
    var app: Context; // eslint-disable-line
    var Hydro: HydroGlobal; // eslint-disable-line
    var addons: Record<string, string>; // eslint-disable-line
}
