#!/usr/bin/env node

const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const { argv } = require('yargs');
const hydro = require('../dist/loader');

fs.ensureDirSync(path.resolve(os.homedir(), '.hydro'));
const addonPath = path.resolve(os.homedir(), '.hydro', 'addon.json');
if (!fs.existsSync(addonPath)) fs.writeFileSync(addonPath, '[]');
const addons = JSON.parse(fs.readFileSync(addonPath).toString());

try {
    const ui = argv.ui || '@hydrooj/ui-default';
    require.resolve(ui);
    addons.push(ui);
} catch (e) {
    console.error('Please also install @hydrooj/ui-default');
}

if (argv._[0]) {
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
        console.log('Current Addons: ', addons);
        fs.writeFileSync(addonPath, JSON.stringify(addons, null, 2));
    }
} else {
    for (const addon of addons) hydro.addon(addon);
    hydro.load().catch((e) => {
        console.error(e);
        process.exit(1);
    });
}
