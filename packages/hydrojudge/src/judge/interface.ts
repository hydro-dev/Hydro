import PQueue from 'p-queue';
import { LangConfig } from '@hydrooj/utils/lib/lang';
import { Execute } from '../interface';
import { CopyInFile } from '../sandbox/interface';

export type Context = JudgeTaskInterface & RuntimeContext;

export interface JudgeTaskInterface {
    next(arg0: {
        compiler_text?: string;
        status?: number;
        message?: string;
        progress?: number;
        addProgress?: number;
        case?: {
            status: number;
            score?: number;
            time_ms: number;
            memory_kb: number;
            message: string;
        };
    }, arg1?: number): void;
    end(arg0: {
        status: number;
        score: number;
        time_ms: number;
        memory_kb: number;
    }): void;
    getLang: (name: string) => LangConfig;

    stat: Record<string, Date>;
    lang: string;
    code: CopyInFile;
    tmpdir: string;
    input?: string;
    clean: Function[];
    config: Config;
    env?: Record<string, string>;
}

export interface RuntimeContext {
    total_score?: number;
    total_status?: number;
    total_time_usage_ms?: number;
    total_memory_usage_kb?: number;

    queue?: PQueue;
    errored?: boolean;
    rerun?: number;
    analysis?: boolean;
    failed?: Record<string, boolean>;

    execute?: Execute;
    checker?: Execute;
    executeInteractor?: Execute;
    executeUser?: Execute;
}

type ExtraFile = string[];

export interface Config {
    type: string;
    subType?: string;
    time: string;
    memory: string;

    subtasks?: SubTask[];
    count?: number;
    checker_type?: string;
    detail?: boolean;
    filename?: string;

    judge_extra_files?: ExtraFile;
    user_extra_files?: ExtraFile;
    template?: Record<string, [string, string]>;

    checker?: string;
    validator?: string;
    std?: string;
    hack?: string;
    interactor?: string;

    outputs?: {
        output: string,
        score: number,
    }[];
}

export interface SubTask {
    time: number;
    memory: number;
    type: 'sum' | 'max' | 'min';
    score: number;
    cases: Record<string, Case>;
    if: string[];
}

export interface ContextSubTask {
    subtask: SubTask;
    score: number;
    status: number;
}

export interface Case {
    id: number;
    input: string;
    output: string;
}
