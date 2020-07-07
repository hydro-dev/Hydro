/* eslint-disable import/no-dynamic-require */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-eval */
import fs from 'fs';
import os from 'os';
import path from 'path';
import download from './download';
import { folderSize } from '../utils';

function root(name: string) {
    return path.resolve(process.cwd(), name);
}

const moduleRoots = [
    root('.build/module'),
    root('module'),
    root(path.resolve(os.homedir(), '.hydro', 'module')),
    root('.'),
];

let moduleRoot: string;
for (const i of moduleRoots) {
    if (fs.existsSync(i) && fs.statSync(i).isDirectory()) {
        moduleRoot = i;
        break;
    }
}

export async function getInstalled() {
    const modules = [];
    const files = fs.readdirSync(`${os.tmpdir()}/hydro/tmp`);
    for (const file of files) {
        const info = `${os.tmpdir()}/hydro/tmp/${file}/hydro.json`;
        if (fs.existsSync(info)) {
            modules.push(file);
        }
    }
    return modules;
}

export async function getDetail() {
    const modules = [];
    const files = fs.readdirSync(`${os.tmpdir()}/hydro/tmp`);
    for (const file of files) {
        const info = `${os.tmpdir()}/hydro/tmp/${file}/hydro.json`;
        if (fs.existsSync(info)) {
            const i = JSON.parse(fs.readFileSync(info).toString());
            const size = folderSize(`${os.tmpdir()}/hydro/tmp/${file}`);
            modules.push({
                id: i.id,
                version: i.version,
                description: i.description,
                size,
            });
        }
    }
    return modules;
}

export async function del(id: string) {
    fs.unlinkSync(root(`${moduleRoot}/${id}.hydro`));
}

export function install(url: string) {
    return download(url, root(`${moduleRoot}/${String.random(16)}.hydro`));
}

global.Hydro.lib.hpm = {
    getInstalled, getDetail, del, install,
};
