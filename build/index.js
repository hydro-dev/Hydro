const fs = require('fs');
const root = require('./root');
try {
    fs.rmdirSync(root('.build'));
} catch (e) { }
fs.mkdirSync(root('.build'));
require('./locales')();
require('./buildModule')();
require('./webpack')();
