/* eslint-disable no-console */
/* eslint-disable import/no-extraneous-dependencies */
const os = require('os');
const path = require('path');
const cluster = require('cluster');
const fs = require('fs-extra');
const { filter } = require('lodash');
const { argv } = require('yargs');
const hydro = require('hydrooj');

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
        fs.readdirSync(path.resolve(process.cwd(), 'packages')),
        (i) => i !== 'hydrooj',
    ).map((i) => `@hydrooj/${i}`);
    fs.writeFileSync(addonPath, JSON.stringify(addons, null, 2));

    try {
        const ui = argv.ui || '@hydrooj/ui-default';
        require.resolve(ui);
        addons = [ui, ...addons];
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
