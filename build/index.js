/* eslint-disable no-await-in-loop */
const path = require('path');
const fs = require('fs-extra');
const argv = require('yargs-parser')(process.argv.slice(2));
const hack = require('./hack');

async function build(type) {
    if (!['development', 'production'].includes(type)) throw new Error(`Unknown type: ${type}`);
    fs.ensureDirSync(path.resolve(__dirname, '..', '.build'));
    for (const task in hack) hack[task]();
    console.log('Build::Main');
    await require('./webpack')(type);
    console.log('Build::Resources');
    require('./resource')(type);
}

build(argv.development ? 'development' : 'production').catch((e) => {
    console.error(e);
    process.exit(1);
});
