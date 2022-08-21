const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const { filter } = require('lodash');
const argv = require('cac')().parse();
const hydro = require('hydrooj');

fs.ensureDirSync(path.resolve(os.homedir(), '.hydro'));
const addonPath = path.resolve(os.homedir(), '.hydro', 'addon.json');
let addons = filter(
    fs.readdirSync(path.resolve(process.cwd(), 'packages')),
    (i) => i !== 'hydrooj',
).map((i) => `@hydrooj/${i}`);
fs.writeFileSync(addonPath, JSON.stringify(addons, null, 2));

try {
    const ui = argv.options.ui || '@hydrooj/ui-default';
    require.resolve(ui);
    addons = [ui, ...addons];
} catch (e) {
    console.error('Please also install @hydrooj/ui-default');
}

addons = Array.from(new Set(addons));
for (const addon of addons) hydro.addon(addon);
(argv.args[0] === 'cli' ? hydro.loadCli : hydro.load)().catch((e) => {
    console.error(e);
    process.exit(1);
});
