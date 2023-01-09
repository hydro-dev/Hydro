process.env.CI = true;
const version = process.versions.node.split('.');
version.pop();
if (+version.join('.') < 18.8) throw new Error('Tests only available in NodeJS>=18.8');
require('hydrooj/bin/hydrooj');
require('./main');
