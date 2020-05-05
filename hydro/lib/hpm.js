/* eslint-disable import/no-dynamic-require */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-eval */
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');
const yaml = require('js-yaml');
const download = require('./download');

function root(name) {
    return path.resolve(process.cwd(), name);
}

async function getInstalled() {
    const files = fs.readdirSync(root('.build/module'));
    const installed = [];
    for (const file of files) {
        if (file.endsWith('.hydro-module')) {
            const f = fs.readFileSync(root(`.build/module/${file}`));
            const s = fs.statSync(root(`.build/module/${file}`));
            installed.push({
                ...yaml.safeLoad(zlib.gunzipSync(f)),
                id: file.split('.')[0],
                size: s.size,
            });
        }
    }
    return installed;
}

async function del(id) {
    fs.unlinkSync(root(`.build/module/${id}.hydro-module`));
}

async function install(id, url) {
    await download(url, root(`module/${id}.hydro-module`));
}

module.exports = { getInstalled, del, install };
