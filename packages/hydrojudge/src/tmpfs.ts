import child from 'child_process';
import os from 'os';
import fs from 'fs-extra';
import log from './log';

const linux = os.platform() === 'linux';
if (!linux) log.warn('Not running on linux. tmpfs disabled.');

const userInfo = os.userInfo();
const uid = userInfo.uid;
if (uid !== 0) log.warn('Not running by root. tmpfs disabled.');

export function mount(path: string, size = '32m') {
    fs.ensureDirSync(path);
    if (linux && uid === 0) child.execSync(`mount tmpfs ${path} -t tmpfs -o size=${size}`);
}

export function umount(path: string) {
    if (linux && uid === 0) child.execSync(`umount ${path}`);
}
