/* eslint-disable prefer-const */
import { argv } from 'yargs';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import yaml from 'js-yaml';
import log from './log';

let CONFIG_FILE = path.resolve(os.homedir(), '.config', 'hydro', 'judge.yaml');
let LANGS_FILE = path.resolve(os.homedir(), '.config', 'hydro', 'langs.yaml');

let config = {
    cache_dir: path.resolve(os.homedir(), '.cache', 'hydro', 'judge'),
    tmp_dir: path.resolve(os.tmpdir(), 'hydro', 'judge'),
    tmpfs_size: '256m',
    retry_delay_sec: 15,
    sandbox_host: 'http://localhost:5050',
    testcases_max: 100,
    total_time_limit: 60,
    parallelism: 2,
    config: null,
    langs: null,
};

export function getConfig(key: string) {
    return global.Hydro ? global.Hydro.model.system.get(`hydrojudge.${key}`) : config[key];
}

if (fs.existsSync(path.resolve(process.cwd(), '.env'))) {
    const env = {};
    const f = fs.readFileSync('.env').toString();
    for (const line of f) {
        const a = line.split('=');
        env[a[0]] = a[1];
    }
    Object.assign(process.env, env);
}

if (!global.Hydro) {
    // standalone
    if (process.env.CONFIG_FILE || argv.config) {
        CONFIG_FILE = path.resolve(process.env.CONFIG_FILE || argv.config as string);
    }
    if (process.env.LANGS_FILE || argv.langs) {
        LANGS_FILE = path.resolve(process.env.LANGS_FILE || argv.langs as string);
    }
    if (process.env.TEMP_DIR || argv.tmp) {
        config.tmp_dir = path.resolve(process.env.TEMP_DIR || argv.tmp as string);
    }
    if (process.env.CACHE_DIR || argv.cache) {
        config.cache_dir = path.resolve(process.env.CACHE_DIR || argv.cache as string);
    }
    if (process.env.EXECUTION_HOST || argv.sandbox) {
        config.sandbox_host = path.resolve(process.env.EXECUTION_HOST || argv.execute as string);
    }
    const configFile = fs.readFileSync(CONFIG_FILE).toString();
    config = { ...config, ...yaml.load(configFile) as any };
    if (fs.existsSync(LANGS_FILE)) config.langs = yaml.load(fs.readFileSync(LANGS_FILE).toString());
    else {
        log.error('Language file not found, using default.');
        const file = path.join(path.dirname(require.resolve('@hydrooj/hydrojudge')), 'setting.yaml');
        const content = yaml.load(fs.readFileSync(file).toString()) as any;
        config.langs = yaml.load(content.langs.default) as any;
    }
}
