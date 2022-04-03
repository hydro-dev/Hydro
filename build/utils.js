/* eslint-disable no-console */
/* eslint-disable import/no-extraneous-dependencies */
const globby = require('globby');
const spawn = require('cross-spawn');

const cwd = process.cwd();

function getWorkspaces() {
    return globby(require('../package.json').workspaces, {
        cwd,
        deep: 0,
        onlyDirectories: true,
        expandDirectories: false,
    });
}

function spawnAsync(command, path) {
    const args = command.split(/\s+/);
    const options = { stdio: 'inherit' };
    if (path) options.cwd = path;
    const child = spawn(args[0], args.slice(1), options);
    return new Promise((resolve, reject) => {
        child.on('close', resolve);
        child.on('error', reject);
    });
}

module.exports = {
    cwd, spawnAsync, getWorkspaces,
};
