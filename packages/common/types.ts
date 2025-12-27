export type CompilableSource = string | {
    file: string;
    lang: string;
};

export enum ProblemType {
    Default = 'default',
    SubmitAnswer = 'submit_answer',
    Interactive = 'interactive',
    Communication = 'communication',
    Objective = 'objective',
    Remote = 'remote_judge',
}

export interface TestCaseConfig {
    input: string;
    output: string;
    time?: string;
    memory?: string;
    score?: number;
}

export enum SubtaskType {
    min = 'min',
    max = 'max',
    sum = 'sum',
}

export interface SubtaskConfig {
    time?: string;
    memory?: string;
    score?: number;
    if?: number[];
    id?: number;
    type?: SubtaskType;
    cases?: TestCaseConfig[];
}

export type DetailType = 'full' | 'case' | 'none';

export interface ProblemConfigFile {
    type?: ProblemType;
    subType?: string;
    target?: string;
    score?: number;
    time?: string;
    memory?: string;
    filename?: string;
    checker_type?: string;
    num_processes?: number;
    user_extra_files?: string[];
    judge_extra_files?: string[];
    detail?: DetailType | boolean;
    answers?: Record<string, [string | string[], number]>;
    redirect?: string;
    cases?: TestCaseConfig[];
    subtasks?: SubtaskConfig[];
    langs?: string[];
    checker?: CompilableSource;
    interactor?: CompilableSource;
    manager?: CompilableSource;
    validator?: CompilableSource;
    time_limit_rate?: Record<string, number>;
    memory_limit_rate?: Record<string, number>;
}

export interface FileInfo {
    /** storage path */
    _id: string;
    /** filename */
    name: string;
    /** file size (in bytes) */
    size: number;
    etag: string;
    lastModified: Date;
}

export interface JudgeMeta {
    problemOwner: number;
    hackRejudge?: string;
    rejudge?: boolean | 'controlled';
    // FIXME stricter types
    type?: string;
}

export interface RecordJudgeInfo {
    score: number;
    memory: number;
    time: number;
    judgeTexts: (string | JudgeMessage)[];
    compilerTexts: string[];
    testCases: Required<TestCase>[];
    /** judge uid */
    judger: number;
    judgeAt: Date;
    status: number;
    subtasks?: Record<number, SubtaskResult>;
}

export interface RecordPayload extends RecordJudgeInfo {
    domainId: string;
    pid: number;
    uid: number;
    lang: string;
    code: string;
    rejudged: boolean;
    source?: string;
    progress?: number;
    /** pretest */
    input?: string | string[];
    /** hack target rid */
    hackTarget?: string;
    /** 0 if pretest&script */
    contest?: string;

    files?: Record<string, string>;
}

export interface JudgeRequest extends Omit<RecordPayload, 'testCases'> {
    priority: number;
    type: 'judge' | 'generate';
    rid: string;
    config: ProblemConfigFile;
    meta: JudgeMeta;
    data: FileInfo[];
    source: string;
    trusted: boolean;
}

export interface TestCase {
    id?: number;
    subtaskId?: number;
    score?: number;
    time: number;
    memory: number;
    status: number;
    message: string;
}

export interface JudgeMessage {
    message: string;
    params?: string[];
    stack?: string;
}

export interface SubtaskResult {
    type: SubtaskType;
    score: number;
    status: number;
}

export interface JudgeResultBody {
    key: string;
    domainId: string;
    rid: string;
    judger?: number;
    progress?: number;
    addProgress?: number;
    case?: TestCase;
    cases?: TestCase[];
    status?: number;
    score?: number;
    /** in miliseconds */
    time?: number;
    /** in kilobytes */
    memory?: number;
    message?: string | JudgeMessage;
    compilerText?: string;
    nop?: boolean;
    subtasks?: Record<number, SubtaskResult>;
}
