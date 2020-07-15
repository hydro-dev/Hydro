/* eslint-disable import/no-dynamic-require */
/* eslint-disable no-await-in-loop */
/* eslint-disable no-eval */
import fs from 'fs';
import os from 'os';
import path from 'path';
import download from './download';
import { folderSize } from '../utils';

const moduleRoots = Array.from(new Set([
    path.resolve(process.cwd(), 'node_modules', '@hydrooj'),
    path.resolve(__dirname, 'node_modules', '@hydrooj'),
    path.resolve(os.tmpdir(), 'hydro', 'module'),
]));

export async function getInstalled() {
    const modules = [];
    for (const moduleRoot of moduleRoots) {
        if (fs.existsSync(moduleRoot)) {
            const files = fs.readdirSync(moduleRoot);
            for (const file of files) {
                const info = path.resolve(moduleRoot, file, 'package.json');
                if (fs.existsSync(info)) modules.push(path.resolve(moduleRoot, file));
            }
        }
    }
    return modules;
}

export async function getDetail() {
    const modules = [];
    for (const moduleRoot of moduleRoots) {
        if (fs.existsSync(moduleRoot)) {
            const files = fs.readdirSync(moduleRoot);
            for (const file of files) {
                const info = path.resolve(moduleRoot, file, 'package.json');
                if (fs.existsSync(info)) {
                    const i = JSON.parse(fs.readFileSync(info).toString());
                    const size = folderSize(path.resolve(moduleRoot, file));
                    modules.push({
                        id: i.name,
                        version: i.version,
                        description: i.description,
                        size,
                    });
                }
            }
        }
    }
    return modules;
}

export function install(url: string, name: string = '') {
    return download(url, path.resolve(process.cwd(), `${name || String.random(16)}.hydro`));
}

global.Hydro.lib.hpm = {
    getInstalled, getDetail, install,
};
