const fs = require('fs');
const root = require('./root');

async function build(type) {
    if (!['development', 'production'].includes(type)) throw new Error('Unknown type: ' + type);
    try {
        fs.rmdirSync(root('.build'));
    } catch (e) { }
    fs.mkdirSync(root('.build'));
    await Promise.all([
        require('./locales')(type),
        require('./buildModule')(type),
        require('./buildTemplate')(type),
        require('./webpack')(type),
    ]);
}

module.exports = build;

if (!module.parent) {
    build('development').catch((e) => {
        console.error(e);
    });
}
