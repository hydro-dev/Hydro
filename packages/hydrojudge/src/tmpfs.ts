import child from 'child_process';
import fs from 'fs-extra';
import os from 'os';
import { Logger } from 'hydrooj/dist/logger';

const logger = new Logger('judge');
const linux = os.platform() === 'linux';
if (!linux) logger.warn('Not running on linux. tmpfs disabled.');

export function mount(path: string, size = '32m') {
    fs.ensureDirSync(path);
    if (linux) child.execSync(`mount tmpfs ${path} -t tmpfs -o size=${size}`);
}

export function umount(path: string) {
    if (linux) child.execSync(`umount ${path}`);
}
