/* eslint-disable import/no-dynamic-require */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-eval */
const fs = require('fs');
const os = require('os');
const path = require('path');
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
    const files = fs.readdirSync(`${os.tmpdir()}/hydro/tmp`);
    for (const file of files) {
        const info = `${os.tmpdir()}/hydro/tmp/${file}/hydro.json`;
        if (fs.existsSync(info)) {
            try {
                const m = file;
                const t = JSON.parse(fs.readFileSync(info).toString());
                modules.push(`${m}|${t.id}`);
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
