const { writeFileSync } = require('fs');
const { argv } = require('yargs');
const pkg = require('../package.json');

if (argv.dev) pkg.version = `${pkg.version}-dev`;
else pkg.version = pkg.version.replace('-dev', '');

writeFileSync(`${process.cwd()}/package.json`, JSON.stringify(pkg, null, 2));
