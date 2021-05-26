#!/usr/bin/env node

const argv = require('cac')().parse();

if (argv.options.debug) process.env.DEV = 'on';
if (argv.args[0] === 'cache') require('../dist/cache')();
else require('../dist/daemon')();
