#!/usr/bin/env node

const os = require('os');
const path = require('path');
const cluster = require('cluster');
const fs = require('fs-extra');
const { argv } = require('yargs');
const hydro = require('../dist/loader');

if (!cluster.isMaster) {
    // Forked by hydro
    hydro.load().catch((e) => {
        console.error(e);
        process.exit(1);
    });
} else {
    fs.ensureDirSync(path.resolve(os.homedir(), '.hydro'));
    const addonPath = path.resolve(os.homedir(), '.hydro', 'addon.json');
    if (!fs.existsSync(addonPath)) fs.writeFileSync(addonPath, '[]');
    let addons = JSON.parse(fs.readFileSync(addonPath).toString());

    try {
        const ui = argv.ui || '@hydrooj/ui-default';
        require.resolve(ui);
        addons.push(ui);
    } catch (e) {
        console.error('Please also install @hydrooj/ui-default');
    }

    if (argv._[0] && argv._[0] !== 'cli') {
        const operation = argv._[0];
        const arg1 = argv._[1];
        const arg2 = argv._[2];
        if (operation === 'addon') {
            if (arg1 === 'add') addons.push(arg2);
            else if (arg1 === 'remove') {
                for (let i = 0; i < addons.length; i++) {
                    if (addons[i] === arg2) {
                        addons.splice(i, 1);
                        break;
                    }
                }
            }
            addons = Array.from(new Set(addons));
            console.log('Current Addons: ', addons);
            fs.writeFileSync(addonPath, JSON.stringify(addons, null, 2));
        }
    } else {
        addons = Array.from(new Set(addons));
        for (const addon of addons) hydro.addon(addon);
        (argv._[0] === 'cli' ? hydro.loadCli : hydro.load)().catch((e) => {
            console.error(e);
            process.exit(1);
        });
    }
}
