#!/usr/bin/env node
require('@hydrooj/utils/lib/register');

const { default: hook } = require('require-resolve-hook');
const { bypass } = hook(/^(hydrooj|@hydrooj\/utils|cordis|schemastery|lodash|js-yaml)/, (id) => bypass(() => require.resolve(id)));

require('./commands');
