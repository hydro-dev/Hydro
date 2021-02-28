#!/usr/bin/env node

const { argv } = require('yargs');

if ((argv._ || [])[0] == 'cache') require('../dist/cache')()
else require('../dist/daemon')();
