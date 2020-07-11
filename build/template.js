const fs = require('fs');
const { root } = require('./utils');

function getFiles(folder) {
    const files = [];
    const f = fs.readdirSync(root(folder));
    for (const i of f) {
        if (!i.startsWith('.')) {
            if (fs.statSync(root(`${folder}/${i}`)).isDirectory()) {
                const g = getFiles(`${folder}/${i}`);
                for (const j of g) files.push(`${i}/${j}`);
            } else files.push(i);
        }
    }
    return files;
}

const build = (dirOrObject) => {
    let templates = {};
    if (typeof dirOrObject === 'string') {
        const files = getFiles(dirOrObject);
        for (const i of files) {
            const template = fs.readFileSync(root(`${dirOrObject}/${i}`)).toString();
            templates[i] = template;
        }
    } else templates = dirOrObject;
    return templates;
};

module.exports = build;
