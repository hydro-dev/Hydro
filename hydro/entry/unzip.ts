/* eslint-disable no-continue */
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import fs from 'fs-extra';

const moduleRoots = Array.from(new Set([
    path.resolve(process.cwd(), 'node_modules', '@hydrooj'),
    path.resolve(process.cwd(), 'modules'),
    path.resolve(process.cwd(), 'module'),
    path.resolve(process.cwd(), '.build'),
    process.cwd(),
    path.resolve(__dirname, 'node_modules', '@hydrooj'),
    path.resolve(__dirname, 'modules'),
    path.resolve(__dirname, 'module'),
    path.resolve(__dirname, '.build'),
    __dirname,
    path.resolve(os.homedir(), '.hydro', 'module'),
]));

const moduleTemp = path.resolve(os.tmpdir(), 'hydro', 'module');
const publicTemp = path.resolve(os.tmpdir(), 'hydro', 'public');
const tmp = path.resolve(os.tmpdir(), 'hydro', '__');

export async function load() {
    process.on('unhandledRejection', (e) => {
        console.error(e);
        process.exit(1);
    });
    fs.ensureDirSync(moduleTemp);
    fs.ensureDirSync(publicTemp);
    for (const moduleRoot of moduleRoots) {
        if (fs.existsSync(moduleRoot)) {
            const files = fs.readdirSync(moduleRoot);
            for (const file of files) {
                try {
                    // This fixs a mistake.
                    // Markdown-it-katex is not a hydro module but a dependency.
                    if (file === 'markdown-it-katex') continue;
                    const modulePath = path.join(moduleRoot, file);
                    const packagejson = path.join(modulePath, 'package.json');
                    if (fs.statSync(modulePath).isFile() && file.endsWith('.hydro')) {
                        // Is *.hydro module
                        const zip = new AdmZip(modulePath);
                        const targetPath = path.resolve(moduleTemp, file.split('.')[0]);
                        zip.extractAllTo(targetPath, true);
                        const content = fs.readdirSync(targetPath);
                        const ipath = path.join(targetPath, content[0]);
                        if (content.length === 1 && fs.statSync(ipath).isDirectory()) {
                            fs.moveSync(ipath, tmp);
                            fs.rmdirSync(targetPath);
                            fs.moveSync(tmp, targetPath);
                        }
                        const publicPath = path.resolve(moduleTemp, file.split('.')[0], 'public');
                        if (fs.existsSync(publicPath)) fs.copySync(publicPath, publicTemp);
                    } else if (fs.existsSync(packagejson)) {
                        // Is a npm package
                        const q = fs.readFileSync(packagejson).toString();
                        if (!JSON.parse(q).name.startsWith('@hydrooj/')) continue;
                        const publicPath = path.resolve(modulePath, 'public');
                        if (fs.existsSync(publicPath)) fs.copySync(publicPath, publicTemp);
                    } else continue;
                } catch (e) {
                    console.error('Module extract fail:', file, e);
                }
            }
        }
    }
    console.log('Unzip done.');
    process.exit(0);
}
