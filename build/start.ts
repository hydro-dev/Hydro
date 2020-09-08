/* eslint-disable no-console */
/* eslint-disable import/no-extraneous-dependencies */
import os from 'os';
import path from 'path';
import cluster from 'cluster';
import fs from 'fs-extra';
import { filter } from 'lodash';
import { argv } from 'yargs';
// @ts-ignore
import * as hydro from 'hydrooj';

if (!cluster.isMaster) {
    // Forked by hydro
    hydro.load().catch((e) => {
        console.error(e);
        process.exit(1);
    });
} else {
    fs.ensureDirSync(path.resolve(os.homedir(), '.hydro'));
    const addonPath = path.resolve(os.homedir(), '.hydro', 'addon.json');
    let addons = filter(
        fs.readdirSync(path.resolve(__dirname, '../packages')),
        (i) => i !== 'hydrooj',
    ).map((i) => `@hydrooj/${i}`);
    fs.writeFileSync(addonPath, JSON.stringify(addons, null, 2));

    try {
        const ui = argv.ui as string || '@hydrooj/ui-default';
        require.resolve(ui);
        addons.push(ui);
    } catch (e) {
        console.error('Please also install @hydrooj/ui-default');
    }

    addons = Array.from(new Set(addons));
    for (const addon of addons) hydro.addon(addon);
    (argv._[0] === 'cli' ? hydro.loadCli : hydro.load)().catch((e) => {
        console.error(e);
        process.exit(1);
    });
}
