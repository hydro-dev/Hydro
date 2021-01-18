/* eslint-disable no-shadow */
// @ts-nocheck
import cluster from 'cluster';
import {
    terminal, TextBox, LabeledInput,
} from 'terminal-kit';
import { ProgressBarOptions } from 'terminal-kit/Terminal';
import { argv } from 'yargs';
import * as bus from './service/bus';

declare module 'terminal-kit/Terminal' {
    interface ProgressBarOptions {
        y?: number;
    }
}

const useTerminal = cluster.isMaster && process.stdout.isTTY && !argv.legacy && !argv._.length;

export namespace Progress {
    export class Progress {
        constructor(public args) {
            console.log('progress start: ', args);
        }

        startItem(args) {
            console.log('progress: ', this.args, args);
        }

        itemDone(args) {
            console.log('done: ', this.args, args);
        }

        stop() {
            console.log('stop', this.args);
        }
    }

    export function create(args: ProgressBarOptions) {
        // TODO handle worker process
        return useTerminal
            ? terminal.progressBar(args)
            : new Progress(args);
    }
}

async function terminate() {
    let hasError = false;
    try {
        await require('./service/bus').parallel('app/exit');
    } catch (e) {
        hasError = true;
    }
    if (useTerminal) {
        terminal.hideCursor(false);
        terminal.styleReset();
        terminal.resetScrollingRegion();
        terminal.moveTo(terminal.width, terminal.height);
        terminal('\n');
    }
    process.exit(hasError ? 1 : 0);
}
process.on('SIGINT', terminate);

if (useTerminal) {
    terminal.clear();
    terminal.grabInput();
    terminal.hideCursor();
    // Clipboard doesn't work well over ssh env, it throws an error.
    terminal.getClipboard = () => { };
    terminal.setClipboard = () => { };
    const document = terminal.createDocument({});
    const LogBox = new TextBox({
        parent: document,
        contentHasMarkup: true,
        scrollable: true,
        vScrollBar: true,
        lineWrap: true,
        x: 0,
        y: 0,
        width: terminal.width,
        height: terminal.height - 1,
    });
    const ShellInput = new LabeledInput({
        parent: document,
        label: '>',
        x: 1,
        y: terminal.height - 1,
        width: terminal.width,
    });
    bus.on('message/log', (message) => {
        LogBox.appendLog(message);
    });
    const history = [''];
    let current = 0;
    ShellInput.on('submit', async (input) => {
        history.push(input);
        current = history.length;
        ShellInput.input.setContent(' '.repeat(terminal.width), false, false);
        ShellInput.input.setContent('', false, false);
        if (input[0] === '@') {
            for (const i in cluster.workers) {
                cluster.workers[i].send({ event: 'message/run', payload: [input.substr(1, input.length - 1)] });
                break;
            }
        } else bus.parallel('message/run', input);
    });
    ShellInput.on('key', (key) => {
        if (key === 'UP') {
            current--;
            ShellInput.input.setContent(' '.repeat(terminal.width), false, false);
            ShellInput.input.setContent(history[current] || '', false, false);
        } else if (key === 'DOWN') {
            current++;
            ShellInput.input.setContent(' '.repeat(terminal.width), false, false);
            ShellInput.input.setContent(history[current] || '', false, false);
        }
    });
    terminal.on('key', (key) => {
        if (key === 'CTRL_C') terminate();
    });
} else if (cluster.isMaster) {
    console.log('Not running in a terminal environment. Interactive mode disabled.');
    bus.on('message/log', (message) => {
        process.stdout.write(`${message}\n`);
    });
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (buf) => {
        const input = buf.toString();
        if (input[0] === '@') {
            for (const i in cluster.workers) {
                cluster.workers[i].send({ event: 'message/run', payload: [input.substr(1, input.length - 1)] });
                break;
            }
        } else bus.parallel('message/run', input);
    });
}
