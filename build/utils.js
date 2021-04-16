/* eslint-disable no-console */
/* eslint-disable import/no-extraneous-dependencies */
const globby = require('globby');
const spawn = require('cross-spawn');

const cwd = process.cwd();

function getWorkspaces() {
    return globby(require('../package').workspaces, {
        cwd,
        deep: 0,
        onlyDirectories: true,
        expandDirectories: false,
    });
}

function spawnSync(command: string, silent?: boolean) {
    if (!silent) console.log(`$ ${command}`);
    const args = command.split(/\s+/);
    const result = spawn.sync(args[0], [...args.slice(1), '--color'], { cwd, encoding: 'utf8' });
    if (result.status) {
        throw new Error(result.stderr);
    } else {
        if (!silent) console.log(result.stdout);
        return result.stdout.trim();
    }
}

function spawnAsync(command: string) {
    const args = command.split(/\s+/);
    const child = spawn(args[0], args.slice(1), { stdio: 'inherit' });
    return new Promise((resolve, reject) => {
        child.on('close', resolve);
        child.on('error', reject);
    });
}

module.exports = {
    cwd, spawnSync, spawnAsync, getWorkspaces,
};
