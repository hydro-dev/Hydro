/* eslint-disable no-console */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable consistent-return */
/* eslint-disable no-await-in-loop */
/* eslint-disable import/no-dynamic-require */
import { gt } from 'semver';
import latest from 'latest-version';
import ora from 'ora';
import {
    PackageJson, getWorkspaces, spawnAsync,
} from './utils';

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
    const bumpMap: Record<string, string> = {};

    let progress = 0;
    spinner.start(`Loading workspaces (0/${folders.length})`);
    await Promise.all(folders.map(async (name) => {
        let meta: PackageJson;
        try {
            meta = require(`../${name}/package.json`);
            if (!meta.private) {
                const version = await latest(meta.name, { version: tag });
                if (gt(meta.version, version)) bumpMap[name] = meta.version;
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
            await spawnAsync(`yarn publish ${name} --new-version ${bumpMap[name]}${tag === 'dev' ? '-dev' : ''} --access public --tag ${tag}`);
        }
    }
    console.log('Release created successfully.');
})();
