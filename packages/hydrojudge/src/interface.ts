import type { LangConfig } from '@hydrooj/utils/lib/lang';
import { NormalizedSubtask } from '@hydrooj/utils/lib/utils';
import type { JudgeRequest as OrigJudgeRequest, ObjectId } from 'hydrooj';
import { JudgeResultBody, ProblemConfigFile } from 'hydrooj';
import { CopyInFile } from './sandbox';
import type { JudgeTask } from './task';

export interface Execute {
    execute: string;
    clean: () => Promise<any>;
    copyIn: Record<string, CopyInFile>;
}

export type NextFunction = (body: Partial<JudgeResultBody>) => Promise<void> | void;

export interface ParsedConfig extends Omit<ProblemConfigFile, 'time' | 'memory' | 'subtasks'> {
    count: number;
    time: number;
    memory: number;
    subtasks: NormalizedSubtask[];
}

// replace ObjectId to string
export type JudgeRequest = {
    [K in keyof OrigJudgeRequest]: OrigJudgeRequest[K] extends ObjectId ? string : OrigJudgeRequest[K];
};

export interface Session {
    getLang: (name: string) => LangConfig;
    getNext: (task: JudgeTask) => NextFunction;
    getEnd: (task: JudgeTask) => NextFunction;
    cacheOpen: (source: string, files: any[], next?: NextFunction) => Promise<string>;
    fetchFile: (target: string) => Promise<string>;
    postFile: (target: string, filename: string, file: string) => Promise<void>;
    config: { detail: boolean, host?: string, trusted?: boolean };
}
