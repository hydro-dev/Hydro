#!/usr/bin/env node

const hydro = require('../dist/loader');

try {
    require.resolve('@hydrooj/ui-default');
} catch (e) {
    console.error('Please also install @hydrooj/ui-default');
    process.exit(1);
}

hydro.addon('@hydrooj/ui-default');

hydro.load().catch((e) => {
    console.error(e);
    process.exit(1);
});
