import child from 'child_process';
import fs from 'fs-extra';

export function mount(path: string, size = '32m') {
    fs.ensureDirSync(path);
    child.execSync(`mount tmpfs ${path} -t tmpfs -o size=${size}`);
}

export function umount(path: string) {
    child.execSync(`umount ${path}`);
}
