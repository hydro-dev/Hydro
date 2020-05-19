/* eslint-disable import/no-dynamic-require */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-eval */
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const path = require('path');
const yaml = require('js-yaml');
const download = require('./download');

function root(name) {
    return path.resolve(process.cwd(), name);
}

const moduleRoots = [
    root('.build/module'),
    root('module'),
    root(path.resolve(os.homedir(), '.hydro', 'module')),
    root('.'),
];
let moduleRoot;
for (const i of moduleRoots) {
    if (fs.existsSync(i) && fs.statSync(i).isDirectory()) {
        moduleRoot = i;
        break;
    }
}

async function getInstalled() {
    const modules = [];
    const files = fs.readdirSync(moduleRoot);
    for (const file of files) {
        if (file.endsWith('.hydro')) {
            try {
                const f = fs.readFileSync(root(`${moduleRoot}/${file}`));
                const s = fs.statSync(root(`${moduleRoot}/${file}`));
                const m = {
                    ...yaml.safeLoad(zlib.gunzipSync(f)),
                    filename: file.split('.')[0],
                    size: s.size,
                };
                modules.push(m);
            } catch (e) {
                if (e.code === 'Z_DATA_ERROR') {
                    console.error(`Module Load Fail: ${file} (File Corrupted)`);
                } else console.error(`Module Load Fail: ${file} ${e}`);
            }
        }
    }
    return modules;
}

async function del(id) {
    fs.unlinkSync(root(`${moduleRoot}/${id}.hydro`));
}

async function install(url) {
    await download(url, root(`${moduleRoot}/${String.random(16)}.hydro`));
}

global.Hydro.lib.hpm = module.exports = { getInstalled, del, install };
