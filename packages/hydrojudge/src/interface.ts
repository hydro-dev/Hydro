import { NormalizedSubtask } from '@hydrooj/utils/lib/utils';
import { JudgeResultBody, ProblemConfigFile } from 'hydrooj';
import { CopyInFile } from './sandbox';

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
