const fs = require('fs');
const root = require('./root');
const ignoreFailure = require('./ignoreFailure');

async function build(type) {
    if (!['development', 'production'].includes(type)) throw new Error(`Unknown type: ${type}`);
    ignoreFailure(fs.mkdirSync, root('.cache'));
    ignoreFailure(fs.mkdirSync, root('.build'));
    await require('./locales')(type);
    await require('./buildModule')(type);
    await require('./buildTemplate')(type);
    await require('./webpack')(type);
}

module.exports = build;

if (!module.parent) {
    build('development').catch((e) => {
        console.error(e);
    });
}
