#!/usr/bin/env node

const argv = require('cac')().parse();
require('@hydrooj/register');

if (argv.args[0] === 'cache') require('../src/cache')();
else require('../src/daemon')();
