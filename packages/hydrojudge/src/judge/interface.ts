import PQueue from 'p-queue';
import type { NormalizedSubtask } from '@hydrooj/utils/lib/common';
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
    executeUser?: Execute;

    _callbackAwait?: Promise<any>;
}

export interface ContextSubTask {
    subtask: NormalizedSubtask;
    score: number;
    status: number;
}
