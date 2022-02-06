/* eslint-disable no-console */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable consistent-return */
/* eslint-disable no-await-in-loop */
/* eslint-disable import/no-dynamic-require */
const esbuild = require('esbuild');
const { readFileSync, writeFileSync } = require('fs');
const major = +process.version.split('.')[0].split('v')[1];
const minor = +process.version.split('.')[1];

let transformTimeUsage = 0;
let transformCount = 0;
let displayTimeout;
function transform(filename) {
    const start = new Date();
    const result = esbuild.buildSync({
        entryPoints: [filename],
        sourcemap: 'inline',
        platform: 'node',
        format: 'cjs',
        target: `node${major}.${minor}`,
        jsx: 'transform',
        write: false,
    });
    if (result.warnings.length) console.warn(result.warnings);
    transformTimeUsage += new Date().getTime() - start.getTime();
    transformCount++;
    if (displayTimeout) clearTimeout(displayTimeout);
    displayTimeout = setTimeout(() => console.log(`Transformed ${transformCount} files. (${transformTimeUsage}ms)`), 1000);
    return result.outputFiles[0].text;
}
const ESM = ['p-queue', 'p-timeout', 'latest-version'];
require.extensions['.js'] = function loader(module, filename) {
    if (ESM.filter((i) => filename.includes(i)).length || major < 14) {
        return module._compile(transform(filename), filename);
    }
    const content = readFileSync(filename, 'utf-8');
    return module._compile(content, filename);
};
require.extensions['.ts'] = require.extensions['.tsx'] = function loader(module, filename) {
    return module._compile(transform(filename), filename);
};

const { gt } = require('semver');
const { default: latest } = require('latest-version');
const path = require('path');
const ora = require('ora');
const { getWorkspaces, spawnAsync } = require('./utils');

const {
    CI, GITHUB_EVENT_NAME, GITHUB_REF,
} = process.env;

const tag = GITHUB_REF === 'refs/heads/master' ? 'latest' : GITHUB_REF === 'refs/heads/develop' ? 'dev' : null;

if (CI && (!tag || GITHUB_EVENT_NAME !== 'push')) {
    console.log('publish skipped.');
    process.exit(0);
}

(async () => {
    let folders = await getWorkspaces();
    if (process.argv[2]) {
        folders = folders.filter((p) => p.startsWith(process.argv[2]));
    }

    const spinner = ora();
    const bumpMap = {};

    let progress = 0;
    spinner.start(`Loading workspaces (0/${folders.length})`);
    await Promise.all(folders.map(async (name) => {
        let meta;
        try {
            meta = require(`../${name}/package.json`);
            if (!meta.private && /^[0-9.]+$/.test(meta.version)) {
                try {
                    const version = await latest(meta.name, { version: tag });
                    if (gt(meta.version, version)) bumpMap[name] = meta.version;
                } catch (e) {
                    if (e.name === 'VersionNotFoundError') bumpMap[name] = meta.version;
                    else throw e;
                }
            }
        } catch (e) {
            console.error(e);
        }
        spinner.text = `Loading workspaces (${++progress}/${folders.length})`;
    }));
    spinner.succeed();

    if (Object.keys(bumpMap).length) {
        for (const name in bumpMap) {
            console.log(`publishing ${name}@${bumpMap[name]} ...`);
            if (tag === 'dev') {
                const pkg = require(`${name}/package.json`);
                pkg.version += '-dev';
                writeFileSync(path.resolve(`${name}/package.json`), JSON.stringify(pkg));
            }
            await spawnAsync(
                `yarn npm publish --access public --tag ${tag}`,
                path.resolve(name),
            );
        }
    }
    console.log('Release created successfully.');
})();
