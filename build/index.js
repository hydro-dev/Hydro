/* eslint-disable no-await-in-loop */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const yaml = require('js-yaml');
const { root, ignoreFailure, rmdir } = require('./utils');
const template = require('./template');

const fsp = fs.promises;

function getFiles(folder) {
    const res = [];
    const files = fs.readdirSync(root(folder));
    for (const filename of files) {
        res.push(filename);
        if (fs.statSync(root(path.join(folder, filename))).isDirectory()) {
            res.push(...(getFiles(path.join(folder, filename)).map((i) => path.join(filename, i))));
        }
    }
    return res;
}

async function build(type) {
    if (!['development', 'production'].includes(type)) throw new Error(`Unknown type: ${type}`);
    ignoreFailure(fs.mkdirSync, root('.build'));
    ignoreFailure(fs.mkdirSync, root('.build/module'));
    const langs = fs.readdirSync(root('locales'));
    const locale = {};
    for (const i of langs) {
        const content = fs.readFileSync(root(`locales/${i}`)).toString();
        locale[i.split('.')[0]] = yaml.safeLoad(content);
    }
    const builtin = {
        id: 'builtin',
        locale,
        template: template('templates'),
        file: {},
    };
    const files = getFiles('.uibuild');
    for (const f of files) {
        if (fs.statSync(root(`.uibuild/${f}`)).isDirectory()) {
            builtin.file[f] = null;
        } else {
            builtin.file[f] = fs.readFileSync(root(`.uibuild/${f}`)).toString('base64');
        }
    }
    const data = zlib.gzipSync(Buffer.from(yaml.safeDump(builtin)), { level: -1 });
    fs.writeFileSync(root('.build/module/builtin.hydro'), data);
    console.log('Build::Module');
    await require('./buildModule')(type);
    console.log('Build::Main');
    await require('./webpack')(type);
    const t = fs.readdirSync(root('.build/module'));
    for (const f of t) {
        if (fs.statSync(root(`.build/module/${f}`)).isDirectory()) {
            rmdir(root(`.build/module/${f}`));
        }
    }
    const modules = [
        'builtin', 'contest-rule-homework', 'judger', 'migrate-vijos', 'module-pastebin',
        'problem-import-syzoj', 'wiki',
    ];
    const j = {};
    for (const m of modules) {
        try {
            const d = await fsp.readFile(root(`.build/module/${m}.hydro`));
            j[m] = d.toString('base64');
        } catch (e) {
            console.error(`Module pack failed: ${m}`);
        }
    }
    const f = fs.readFileSync(root('.build/development.js')).toString();
    const file = `global._hydroModule=${JSON.stringify(j)};${f}`;
    fs.writeFileSync(root('.build/full.js'), file);
}

module.exports = build;

if (!module.parent) {
    build('development').catch((e) => {
        console.error(e);
    });
}
