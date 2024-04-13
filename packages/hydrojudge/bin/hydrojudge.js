#!/usr/bin/env node

const argv = require('cac')().parse();
require('@hydrooj/register');

if (argv.args[0] === 'cache') require('../src/cache')();
else if (argv.args[0] === 'terminal') require('../src/terminal')();
else require('../src/daemon')();
