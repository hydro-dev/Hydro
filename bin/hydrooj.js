#!/usr/bin/env node

const { argv } = require('yargs');
const hydro = require('../dist/loader');

const ui = argv.ui || '@hydrooj/ui-default';

try {
    require.resolve(ui);
} catch (e) {
    console.error('Please also install @hydrooj/ui-default');
    process.exit(1);
}

hydro.addon(ui);

hydro.load().catch((e) => {
    console.error(e);
    process.exit(1);
});
