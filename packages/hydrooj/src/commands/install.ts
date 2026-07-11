import child from 'child_process';
import os from 'os';
import path from 'path';
import { BlobReader, ZipReader } from '@zip.js/zip.js';
import { CAC } from 'cac';
import fs from 'fs-extra';
import superagent from 'superagent';
import tar from 'tar';
import { extractZip, Logger } from '@hydrooj/utils';
import { version } from 'hydrooj/package.json';
import { hydroPath } from '../options';

const logger = new Logger('install');
let yarnVersion = 0;
try {
    yarnVersion = +child.execSync('yarn --version', { cwd: os.tmpdir() }).toString().split('v').pop()!.split('.')[0];
} catch (e) {
    // yarn 2 does not support global dir
}

const addonDir = path.join(hydroPath, 'addons');
const userAgent = `Hydro/${version} Node.js/${process.version.split('v').pop()}`;

function downloadAndExtractTgz(url: string, dest: string) {
    return new Promise((resolve, reject) => {
        superagent.get(url)
            .set('User-Agent', userAgent)
            .pipe(tar.x({
                C: dest,
                strip: 1,
            }))
            .on('finish', resolve)
            .on('error', reject);
    });
}
async function downloadAndExtractZip(url: string, dest: string) {
    let res;
    try {
        res = await superagent.get(url).set('User-Agent', userAgent).responseType('arraybuffer');
    } catch (e) {
        logger.error('Failed to download', url, e.message);
        return;
    }
    await extractZip(new ZipReader(new BlobReader(new Blob([res.body]))), dest, { strip: true, overwrite: true });
}
const types = {
    '.tgz': downloadAndExtractTgz,
    '.tar.gz': downloadAndExtractTgz,
    '.zip': downloadAndExtractZip,
};

export function register(cli: CAC) {
    cli.command('install [package]').action(async (_src) => {
        if (!_src) {
            cli.outputHelp();
            return;
        }
        if (yarnVersion !== 1) throw new Error('Yarn 1 is required.');
        let newAddonPath: string = '';
        fs.ensureDirSync(addonDir);
        let src = _src;
        if (!src.startsWith('http')) {
            try {
                src = child.execSync(`yarn info ${src} dist.tarball`, { cwd: os.tmpdir() })
                    .toString().trim().split('\n')[1];
                if (!src.startsWith('http')) throw new Error();
            } catch (e) {
                throw new Error('Cannot fetch package info.');
            }
        }
        const url = new URL(src);
        const filename = url.pathname.split('/').pop()!;
        if (Object.keys(types).find((i) => filename.endsWith(i))) {
            const name = filename.replace(/(-?(\d+\.\d+\.\d+|latest))?(\.tar\.gz|\.zip|\.tgz)$/g, '');
            newAddonPath = path.join(addonDir, name);
            logger.info(`Downloading ${src} to ${newAddonPath}`);
            fs.ensureDirSync(newAddonPath);
            fs.emptyDirSync(newAddonPath);
            const func = types[Object.keys(types).find((i) => filename.endsWith(i))]!;
            await func(src, newAddonPath);
        } else throw new Error('Unsupported file type');
        if (!newAddonPath) throw new Error('Addon download failed');
        logger.info('Installing depedencies');
        if (!fs.existsSync(path.join(newAddonPath, 'package.json'))) throw new Error('Invalid plugin file');
        child.execSync('yarn --production', { stdio: 'inherit', cwd: newAddonPath });
        child.execSync(`hydrooj addon add '${newAddonPath}'`);
        fs.writeFileSync(path.join(newAddonPath, '__metadata__'), JSON.stringify({
            src: _src,
            lastUpdate: Date.now(),
        }));
        logger.success(`Successfully installed ${_src}.`);
        logger.info('Please restart Hydro to apply changes.');
    });
    cli.command('uninstall [package]').action(async (name) => {
        if (!name) {
            cli.outputHelp();
            return;
        }
        if (yarnVersion !== 1) throw new Error('Yarn 1 is required.');
        fs.ensureDirSync(addonDir);
        const plugins = fs.readdirSync(addonDir);
        if (!plugins.includes(name)) {
            throw new Error(`Plugin ${name} not found or not installed with \`hydrooj install\`.`);
        }
        const newAddonPath = path.join(addonDir, name);
        child.execSync(`hydrooj addon remove '${newAddonPath}'`, { stdio: 'inherit' });
        fs.removeSync(newAddonPath);
        logger.success(`Successfully uninstalled ${name}.`);
    });
}
