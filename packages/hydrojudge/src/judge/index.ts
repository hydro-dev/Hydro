import * as def from './default';
import * as hack from './hack';
import * as interactive from './interactive';
import * as run from './run';
import * as submit_answer from './submit_answer';

export = {
    default: def, interactive, run, submit_answer, hack, objective: submit_answer,
};
