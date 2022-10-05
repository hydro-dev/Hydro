#!/usr/bin/env node
require('@hydrooj/utils/lib/register');

const { default: hook } = require('require-resolve-hook');
const { bypass } = hook(/^(hydrooj|@hydrooj\/utils|cordis|schemastery|lodash|js-yaml)/, (id) => {
    if (id.startsWith('hydrooj/src')) {
        console.log('module require via %s is deprecated.', id);
        if (process.env.DEV) {
            console.log(
                new Error().stack.split('\n')
                    .filter((i) => !i.includes('node:internal') && i.startsWith(' '))
                    .join('\n'),
            );
        }
    }
    return bypass(() => require.resolve(id));
});

require('./commands');
