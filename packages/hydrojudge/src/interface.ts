import {
    JudgeResultBody, type LangConfig, NormalizedSubtask, ProblemConfigFile,
} from '@hydrooj/common';
import { CopyInFile } from './sandbox';
import type { JudgeTask } from './task';

export interface Execute {
    execute: string;
    clean: () => Promise<any>;
    copyIn: Record<string, CopyInFile>;
    _cacheable?: string;
}

export type NextFunction = (body: Partial<JudgeResultBody>) => Promise<void> | void;

export interface ParsedConfig extends Omit<ProblemConfigFile, 'time' | 'memory' | 'subtasks'> {
    count: number;
    time: number;
    memory: number;
    subtasks: NormalizedSubtask[];
}

export { JudgeRequest } from '@hydrooj/common';

export interface Session {
    getLang: (name: string) => LangConfig;
    getNext: (task: JudgeTask) => NextFunction;
    getEnd: (task: JudgeTask) => NextFunction;
    fetchFile: <T extends null | string>(namespace: T, files: Record<string, string>) => Promise<T extends null ? string : null>;
    postFile: (target: string, filename: string, file: string) => Promise<void>;
    config: { detail: boolean, host?: string, trusted?: boolean };
}
