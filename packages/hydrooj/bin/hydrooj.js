#!/usr/bin/env node

const os = require('os');
const path = require('path');
const cluster = require('cluster');
const fs = require('fs-extra');
const { argv } = require('yargs');
const child = require('child_process');

if (!cluster.isMaster) {
    const hydro = require('../dist/loader');
    // Forked by hydro
    hydro.load().catch((e) => {
        console.error(e);
        process.exit(1);
    });
} else {
    const hydroPath = path.resolve(os.homedir(), '.hydro');
    fs.ensureDirSync(hydroPath);
    const addonPath = path.resolve(hydroPath, 'addon.json');
    if (!fs.existsSync(addonPath)) fs.writeFileSync(addonPath, '[]');
    let addons = JSON.parse(fs.readFileSync(addonPath).toString());

    if (argv._[0] === 'db') {
        function buildUrl(opts) {
            let mongourl = `${opts.protocol}://`;
            if (opts.username) mongourl += `${opts.username}:${opts.password}@`;
            mongourl += `${opts.host}:${opts.port}/${opts.name}`;
            if (opts.url) mongourl = opts.url;
            return mongourl;
        }
        const dbConfig = fs.readFileSync(path.resolve(hydroPath, 'config.json'), 'utf-8');
        const url = buildUrl(JSON.parse(dbConfig));
        return child.spawn('mongo', [url], { stdio: 'inherit' });
    }

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
        const hydro = require('../dist/loader');
        addons = Array.from(new Set(addons));
        for (const addon of addons) hydro.addon(addon);
        (argv._[0] === 'cli' ? hydro.loadCli : hydro.load)().catch((e) => {
            console.error(e);
            process.exit(1);
        });
    }
}
