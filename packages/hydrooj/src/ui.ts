/* eslint-disable @typescript-eslint/no-shadow */
import { Logger } from './logger';
import * as bus from './service/bus';

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

const shell = new Logger('shell');
async function executeCommand(input: string) {
    input = input.trim();
    // Clear the stack
    setImmediate(async () => {
        if (input === 'exit' || input === 'quit' || input === 'shutdown') {
            return process.kill(process.pid, 'SIGINT');
        }
        try {
            // eslint-disable-next-line no-eval
            shell.info(await eval(input));
        } catch (e) {
            shell.warn(e);
        }
        return true;
    });
}

process.stdin.setEncoding('utf-8');
if (process.stdin.setRawMode) process.stdin.setRawMode(false);
process.stdin.on('data', (buf) => {
    const input = buf.toString();
    executeCommand(input);
});
