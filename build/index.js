const fs = require('fs');
const root = require('./root');
try {
    fs.rmdirSync(root('.build'));
} catch (e) { }
fs.mkdirSync(root('.build'));
let progress = (name) => ((prog) => {
    console.log(name, prog);
});
require('./locales')('locales', progress);
require('./webpack')('webpack', progress);
