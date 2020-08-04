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

if (CI && (GITHUB_REF !== 'refs/heads/master' || GITHUB_EVENT_NAME !== 'push')) {
    console.log('publish skipped.');
    process.exit(0);
}

(async () => {
    let folders = await getWorkspaces();
    if (process.argv[2]) {
        folders = folders.filter((path) => path.startsWith(process.argv[2]));
    }

    const spinner = ora();
    const bumpMap: Record<string, string> = {};

    let progress = 0;
    spinner.start(`Loading workspaces (0/${folders.length})`);
    await Promise.all(folders.map(async (name) => {
        let meta: PackageJson;
        try {
            meta = require(`../${name}/package`);
            if (!meta.private) {
                const version = await latest(meta.name);
                if (gt(meta.version, version)) {
                    bumpMap[name] = meta.version;
                }
            }
        } catch { /* pass */ }
        spinner.text = `Loading workspaces (${++progress}/${folders.length})`;
    }));
    spinner.succeed();

    if (Object.keys(bumpMap).length) {
        for (const name in bumpMap) {
            console.log(`publishing ${name}@${bumpMap[name]} ...`);
            await spawnAsync(`yarn publish ${name} --new-version ${bumpMap[name]} --access public`);
        }
    }
    console.log('Release created successfully.');
})();
