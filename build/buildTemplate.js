const fs = require('fs');
const yaml = require('js-yaml');
const root = require('./root');
const template = require('./template');

const build = async () => {
    const exclude = [
        'partials/training_default.json',
        'partials/problem_default.md',
        'bsod.html',
    ];
    fs.writeFileSync(root('.build/template.yaml'), yaml.safeDump(template('templates', exclude)));
};

module.exports = build;
