const { writeFileSync } = require('fs');
const argv = require('cac')().parse();
const pkg = require('../package.json');

if (argv.options.dev) pkg.version = `${pkg.version}-dev`;
else pkg.version = pkg.version.replace('-dev', '');

writeFileSync(`${process.cwd()}/package.json`, JSON.stringify(pkg, null, 2));
