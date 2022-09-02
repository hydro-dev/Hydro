import * as def from './default';
import * as hack from './hack';
import * as interactive from './interactive';
import { Context } from './interface';
import * as objective from './objective';
import * as run from './run';
import * as submit_answer from './submit_answer';

export = {
    default: def, interactive, run, submit_answer, objective, hack,
} as Record<string, { judge(ctx: Context): Promise<void> }>;
