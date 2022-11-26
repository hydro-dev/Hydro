import { SpawnOptions } from 'child_process';
import spawn from 'cross-spawn';
import { globby } from 'globby';

export const cwd = process.cwd();

export function getWorkspaces() {
    return globby(require('../package.json').workspaces, {
        cwd,
        deep: 0,
        onlyDirectories: true,
        expandDirectories: false,
    });
}

export function spawnAsync(command, path) {
    const args = command.split(/\s+/);
    const options: SpawnOptions = { stdio: 'inherit' };
    if (path) options.cwd = path;
    const child = spawn(args[0], args.slice(1), options);
    return new Promise((resolve, reject) => {
        child.on('close', resolve);
        child.on('error', reject);
    });
}
