#!/usr/bin/env node

const { argv } = require('yargs');

if (argv._[0] == 'cache') require('../dist/cache')()
else if (!argv._) require('../dist/daemon')();