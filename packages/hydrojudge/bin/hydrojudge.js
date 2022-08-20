#!/usr/bin/env node

const argv = require('cac')().parse();
require('@hydrooj/utils/lib/register');

if (argv.args[0] === 'cache') require('../src/cache')();
else require('../src/daemon')();
