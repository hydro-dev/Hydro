/* eslint-disable @typescript-eslint/no-shadow */
import cluster from 'cluster';
import { argv } from 'yargs';
import BottomBar from 'inquirer/lib/ui/bottom-bar';
import { Logger } from './logger';
import * as bus from './service/bus';

const logger = new Logger('ui');
const useTerminal = cluster.isMaster && process.stdout.isTTY;
const disabledTerminal = argv.legacy || argv._.length || process.env.NODE_ENV === 'test';

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

    export function create(args) {
        return new Progress(args);
    }
}

async function terminate() {
    let hasError = false;
    try {
        await bus.parallel('app/exit');
    } catch (e) {
        hasError = true;
    }
    process.exit(hasError ? 1 : 0);
}
process.on('SIGINT', terminate);

if (useTerminal && !disabledTerminal) {
    let current = 0;
    const history = [''];
    let input = '';
    const ui = new BottomBar({ bottomBar: '>' });
    process.stdin.on('data', (data) => {
        // Control Seq?
        const seq = data.toString('hex');
        if (seq === '7f') input = input.substr(0, input.length - 1);
        else if (seq === '1b5b41') {
            // Arrow up
            current--;
            input = history[current];
        } else if (seq === '1b5b42') {
            // Arrow down
            current++;
            input = history[current];
        } else if (seq === '0d') {
            // Enter
            history.push(input);
            current = history.length;
            if (input[0] === '@') {
                for (const i in cluster.workers) {
                    cluster.workers[i].send({ event: 'message/run', payload: [input.substr(1, input.length - 1)] });
                    break;
                }
            } else bus.parallel('message/run', input);
            input = '';
        } else input += data.toString();
        ui.updateBottomBar(`>${input}`);
    });
    bus.on('message/log', (message) => {
        ui.log.write(message);
    });
    if (process.env.SSH_CLIENT || process.env.SSH_TTY || process.env.SSH_CONNECTION) {
        logger.warn('Running over ssh detected. Add a --legacy when starting if GUI mode doesn\'t work properly.');
    }
} else if (cluster.isMaster) {
    if (!disabledTerminal) console.log('Not running in a terminal environment. Interactive mode disabled.');
    bus.on('message/log', (message) => {
        process.stdout.write(`${message}\n`);
    });
    if (process.env.NODE_ENV !== 'test') {
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
}
