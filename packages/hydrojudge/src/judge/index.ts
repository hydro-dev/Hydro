import * as def from './default';
import * as interactive from './interactive';
import * as run from './run';
import * as submit_answer from './submit_answer';
import * as hack from './hack';

export = {
    default: def, interactive, run, submit_answer, hack, subjective: submit_answer,
};
