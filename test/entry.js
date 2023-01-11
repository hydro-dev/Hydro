process.env.CI = true;
const version = process.versions.node.split('.').map((i) => i.padStart(2, '0'));
version.pop();
if (+version.join('.') < 18.08) throw new Error('Tests only available in NodeJS>=18.8');
require('hydrooj/bin/hydrooj');
require('./main');
