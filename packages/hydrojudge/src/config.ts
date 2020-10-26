import { argv } from 'yargs';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import log from './log';

const config = {
    CONFIG_FILE: path.resolve(os.homedir(), '.config', 'hydro', 'judge.yaml'),
    LANGS_FILE: path.resolve(os.homedir(), '.config', 'hydro', 'langs.yaml'),
    CACHE_DIR: path.resolve(os.homedir(), '.cache', 'hydro', 'judge'),
    FILES_DIR: path.resolve(os.homedir(), '.cache', 'hydro', 'files', 'judge'),
    SYSTEM_MEMORY_LIMIT_MB: 1024,
    SYSTEM_TIME_LIMIT_MS: 16000,
    SYSTEM_PROCESS_LIMIT: 32,
    RETRY_DELAY_SEC: 15,
    TEMP_DIR: path.resolve(os.tmpdir(), 'hydro', 'judge'),
    EXECUTION_HOST: 'http://localhost:5050',
    CONFIG: null,
    LANGS: null,
    changeDefault(name, from, to) {
        if (config[name] === from) config[name] = to;
    },
};

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
    config.CONFIG_FILE = path.resolve(process.env.CONFIG_FILE || argv.config as string);
}
if (process.env.LANGS_FILE || argv.langs) {
    config.LANGS_FILE = path.resolve(process.env.LANGS_FILE || argv.langs as string);
}
if (process.env.TEMP_DIR || argv.tmp) {
    config.TEMP_DIR = path.resolve(process.env.TEMP_DIR || argv.tmp as string);
}
if (process.env.CACHE_DIR || argv.cache) {
    config.CACHE_DIR = path.resolve(process.env.CACHE_DIR || argv.cache as string);
}
if (process.env.FILES_DIR || argv.files) {
    config.FILES_DIR = path.resolve(process.env.FILES_DIR || argv.files as string);
}
if (process.env.EXECUTION_HOST || argv.execute) {
    config.EXECUTION_HOST = path.resolve(process.env.EXECUTION_HOST || argv.execute as string);
}
if (!(fs.existsSync(config.LANGS_FILE) || global.Hydro)) {
    fs.ensureDirSync(path.dirname(config.LANGS_FILE));
    if (fs.existsSync(path.join(__dirname, '..', 'examples', 'langs.yaml'))) {
        log.error('Language file not found, using default.');
        config.LANGS_FILE = path.join(__dirname, '..', 'examples', 'langs.yaml');
    } else throw new Error('Language file not found');
}

export = config;
