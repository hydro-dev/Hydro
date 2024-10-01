/* eslint-disable @typescript-eslint/no-shadow */
import { Logger } from './logger';
import * as bus from './service/bus';

let terminating = false;
async function terminate() {
    if (terminating) process.exit(1);
    let hasError = false;
    terminating = true;
    setTimeout(() => {
        new Logger('exit').info('Cleaning up temporary files... (Press Ctrl-C again to force exit)');
    }, 1000);
    try {
        await bus.parallel('app/exit');
    } catch (e) {
        hasError = true;
    }
    process.exit(hasError ? 1 : 0);
}
process.on('SIGINT', terminate);
process.on('SIGTERM', terminate);

const shell = new Logger('shell');
async function executeCommand(input: string) {
    // Clear the stack
    setImmediate(async () => {
        if (input === 'exit' || input === 'quit' || input === 'shutdown') {
            return process.kill(process.pid, 'SIGINT');
        }
        if (process.stdin.isRaw) return false;
        try {
            // eslint-disable-next-line no-eval
            shell.info(await eval(input));
        } catch (e) {
            shell.warn(e);
        }
        return true;
    });
}

let readlineCallback;

process.stdin.setEncoding('utf-8');
process.stdin.setRawMode?.(false);
process.stdin.on('data', (buf) => {
    const input = buf.toString().trim();
    if (readlineCallback) {
        readlineCallback(input);
        readlineCallback = null;
    } else executeCommand(input);
});

export const useReadline = (callback: (str: string) => any) => {
    if (readlineCallback) throw new Error('Already waiting for input.');
    readlineCallback = callback;
};
export const readline = () => new Promise<string>((resolve) => { useReadline(resolve); });
