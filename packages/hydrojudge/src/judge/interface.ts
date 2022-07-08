import PQueue from 'p-queue';
import type { NormalizedSubtask } from '@hydrooj/utils/lib/common';
import type { LangConfig } from '@hydrooj/utils/lib/lang';
import type { JudgeResultBody } from 'hydrooj';
import { Execute } from '../interface';
import { CopyInFile } from '../sandbox/interface';

export type Context = JudgeTaskInterface & RuntimeContext;

export interface JudgeTaskInterface {
    next(data: Partial<JudgeResultBody>, id?: number): void;
    end(data: Partial<JudgeResultBody>): void;
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

export interface Config {
    type: string;
    subType?: string;
    time: string;
    memory: string;

    subtasks?: NormalizedSubtask[];
    count?: number;
    checker_type?: string;
    detail?: boolean;
    filename?: string;

    judge_extra_files: string[];
    user_extra_files: string[];
    template?: Record<string, [string, string]>;

    checker?: string;
    validator?: string;
    std?: string;
    hack?: string;
    interactor?: string;

    answers?: Record<string, [answer: string | string[], score: number]>;
}

export interface ContextSubTask {
    subtask: NormalizedSubtask;
    score: number;
    status: number;
}
