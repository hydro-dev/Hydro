/* eslint-disable prefer-const */
/* eslint-disable import/no-mutable-exports */
import { argv } from 'yargs';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import yaml from 'js-yaml';
import log from './log';

export let CONFIG_FILE = path.resolve(os.homedir(), '.config', 'hydro', 'judge.yaml');
export let CACHE_DIR = path.resolve(os.homedir(), '.cache', 'hydro', 'judge');
export let FILES_DIR = path.resolve(os.homedir(), '.cache', 'hydro', 'files', 'judge');
export let RETRY_DELAY_SEC = 15;
export let TEMP_DIR = path.resolve(os.tmpdir(), 'hydro', 'judge');
export let EXECUTION_HOST = 'http://localhost:5050';
export let CONFIG = null;
export let LANGS = null;

let LANGS_FILE = path.resolve(os.homedir(), '.config', 'hydro', 'langs.yaml');

if (fs.existsSync(path.resolve(process.cwd(), '.env'))) {
    const env = {};
    const f = fs.readFileSync('.env').toString();
    for (const line of f) {
        const a = line.split('=');
        env[a[0]] = a[1];
    }
    Object.assign(process.env, env);
}

if (process.env.CONFIG_FILE || argv.config) {
    CONFIG_FILE = path.resolve(process.env.CONFIG_FILE || argv.config as string);
}
if (process.env.LANGS_FILE || argv.langs) {
    LANGS_FILE = path.resolve(process.env.LANGS_FILE || argv.langs as string);
}
if (process.env.TEMP_DIR || argv.tmp) {
    TEMP_DIR = path.resolve(process.env.TEMP_DIR || argv.tmp as string);
}
if (process.env.CACHE_DIR || argv.cache) {
    CACHE_DIR = path.resolve(process.env.CACHE_DIR || argv.cache as string);
}
if (process.env.FILES_DIR || argv.files) {
    FILES_DIR = path.resolve(process.env.FILES_DIR || argv.files as string);
}
if (process.env.EXECUTION_HOST || argv.execute) {
    EXECUTION_HOST = path.resolve(process.env.EXECUTION_HOST || argv.execute as string);
}
if (!global.Hydro) {
    if (fs.existsSync(LANGS_FILE)) LANGS = yaml.safeLoad(fs.readFileSync(LANGS_FILE).toString());
    else {
        log.error('Language file not found, using default.');
        const file = path.join(path.dirname(require.resolve('@hydrooj/hydrojudge')), 'setting.yaml');
        const content = yaml.safeLoad(fs.readFileSync(file).toString()) as any;
        LANGS = yaml.safeLoad(content.langs.default) as any;
    }
    if (!(fs.existsSync(LANGS_FILE) || global.Hydro)) {
        fs.ensureDirSync(path.dirname(LANGS_FILE));
        LANGS_FILE = path.join(__dirname, '..', 'examples', 'langs.yaml');
    }
}
