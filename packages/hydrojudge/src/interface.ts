import {
    DetailType, JudgeResultBody, type LangConfig, NormalizedSubtask, ProblemConfigFile,
} from '@hydrooj/common';
import { CopyInFile } from './sandbox';
import type { JudgeTask } from './task';

export interface Execute {
    execute: string;
    clean: () => Promise<any>;
    copyIn: Record<string, CopyInFile>;
    [Symbol.asyncDispose]: () => Promise<any>;
    _cacheable?: string;
}

export type NextFunction = (body: Partial<JudgeResultBody>) => Promise<void> | void;

export interface ParsedConfig extends Omit<ProblemConfigFile, 'time' | 'memory' | 'subtasks' | 'detail'> {
    count: number;
    time: number;
    memory: number;
    subtasks: NormalizedSubtask[];
    detail: DetailType;
}

export { JudgeRequest } from '@hydrooj/common';

export interface Session {
    getLang: (name: string, doThrow?: boolean) => LangConfig;
    getReporter: (task: JudgeTask) => { next: NextFunction, end: NextFunction };
    fetchFile: <T extends null | string>(namespace: T, files: Record<string, string>, ctx: JudgeTask) => Promise<T extends null ? string : null>;
    postFile: (target: string, filename: string, file: string) => Promise<void>;
    config: { detail: DetailType, host?: string, trusted?: boolean };
}
