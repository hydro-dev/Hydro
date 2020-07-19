#!/usr/bin/env node

const hydro = require('../dist/loader');

hydro.addon('.');

try {
    const uiDefault = require.resolve('@hydrooj/ui-default');
    hydro.addon(uiDefault);
} catch (e) {
    console.error('Please also install @hydrooj/ui-default');
    process.exit(1);
}

hydro.load().catch((e) => {
    console.error(e);
    process.exit(1);
});
