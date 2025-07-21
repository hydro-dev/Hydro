import PQueue from 'p-queue';
import { NormalizedSubtask } from '@hydrooj/common';
import { Execute } from '../interface';
import { JudgeTask } from '../task';

export type Context = JudgeTask & RuntimeContext;

export interface RuntimeContext {
    total_score?: number;
    total_status?: number;
    total_time?: number;
    total_memory?: number;

    queue?: PQueue;
    errored?: boolean;
    rerun?: number;
    analysis?: boolean;
    failed?: Record<string, boolean>;

    execute?: Execute;
    checker?: Execute;
    executeInteractor?: Execute;
    executeManager?: Execute;
    executeUser?: Execute;
}

export interface ContextSubTask {
    subtask: NormalizedSubtask;
    score: number;
    status: number;
}
