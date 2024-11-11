import { execSync } from 'child_process';
import * as fs from 'fs';
import semver from 'semver';
import { getWorkspaces } from './utils';

const ignore = ['@hydrooj/eslint-config'];
const lowest = '18.0.0';
const processed = {};

function addRange(range: string, hint: string) {
    const minVersion = semver.minVersion(range);
    if (semver.gt(minVersion!, lowest)) {
        console.log(`${hint} wants ${minVersion}`);
        execSync(`yarn why ${hint}`, { stdio: 'inherit' });
    }
}

function calcPackage(name: string) {
    if (processed[name]) return;
    processed[name] = true;
    let jsonPath = '';
    try {
        jsonPath = require.resolve(`${name}/package.json`);
    } catch (e) {
        jsonPath = `${require.resolve(name).split(name)[0] + name}/package.json`;
    }
    try {
        const json = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        if (json.engines?.node) addRange(json.engines.node, name);
        const deps = json.dependencies || {};
        for (const dep in deps) {
            calcPackage(dep);
        }
    } catch (e) {
        console.error(`failed to process ${name}`);
    }
}

(async () => {
    let folders = await getWorkspaces();
    if (process.argv[2]) {
        folders = folders.filter((p) => p.startsWith(process.argv[2]));
    }

    for (const name of folders) {
        try {
            // eslint-disable-next-line import/no-dynamic-require
            const meta = require(`../${name}/package.json`);
            if (!ignore.includes(meta.name)) calcPackage(meta.name);
        } catch (e) {
            console.error(e);
        }
    }
    console.log(lowest);
})().catch((e) => process.exit(1));
