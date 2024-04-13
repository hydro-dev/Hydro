/* eslint-disable import/no-dynamic-require */
import os from 'os';
import path from 'path';
import cac from 'cac';
import fs from 'fs-extra';

const argv = cac().parse();

const hydroPath = path.resolve(os.homedir(), '.hydro');
fs.ensureDirSync(hydroPath);
const addonPath = path.resolve(hydroPath, 'addon.json');
if (!fs.existsSync(addonPath)) fs.writeFileSync(addonPath, '[]');
let addons = JSON.parse(fs.readFileSync(addonPath).toString());

addons = Array.from(new Set(addons));
if (!argv.args[0] || argv.args[0] === 'cli') {
    const hydro = require('../src/loader');
    for (const addon of addons) hydro.addon(addon);
    (argv.args[0] === 'cli' ? hydro.loadCli : hydro.load)().catch((e) => {
        console.error(e);
        process.exit(1);
    });
} else {
    const cli = cac();
    require('../src/commands/install').register(cli);
    require('../src/commands/addon').register(cli);
    require('../src/commands/db').register(cli);
    require('../src/commands/patch').register(cli);
    cli.help();
    cli.parse();
    if (!cli.matchedCommand) {
        for (const i of addons) {
            try {
                require(`${i}/command.ts`).apply(cli);
            } catch (e) {
                try {
                    require(`${i}/command.js`).apply(cli);
                } catch (err) { }
            }
        }
        cli.parse();
        if (!cli.matchedCommand) {
            console.log('Unknown command.');
            cli.outputHelp();
        }
    }
}
