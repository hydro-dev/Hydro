/* eslint-disable prefer-const */
import os from 'os';
import path from 'path';
import cac from 'cac';
import fs from 'fs-extra';
import yaml from 'js-yaml';

const argv = cac().parse();
let CONFIG_FILE = path.resolve(os.homedir(), '.config', 'hydro', 'judge.yaml');

let config = {
    cache_dir: path.resolve(os.homedir(), '.cache', 'hydro', 'judge'),
    tmp_dir: path.resolve(os.tmpdir(), 'hydro', 'judge'),
    tmpfs_size: '256m',
    stdio_size: '32m',
    memoryMax: '512m',
    strict_memory: false,
    retry_delay_sec: 15,
    sandbox_host: 'http://localhost:5050',
    testcases_max: 100,
    total_time_limit: 60,
    parallelism: 2,
    rerun: 0,
    rate: 1,
    config: null,
    langs: null,
    env: `\
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
HOME=/w`,
    secret: String.random(32),
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
    if (process.env.CONFIG_FILE || argv.options.config) {
        CONFIG_FILE = path.resolve(process.env.CONFIG_FILE || argv.options.config);
    }
    if (process.env.TEMP_DIR || argv.options.tmp) {
        config.tmp_dir = path.resolve(process.env.TEMP_DIR || argv.options.tmp);
    }
    if (process.env.CACHE_DIR || argv.options.cache) {
        config.cache_dir = path.resolve(process.env.CACHE_DIR || argv.options.cache);
    }
    if (process.env.EXECUTION_HOST || argv.options.sandbox) {
        config.sandbox_host = path.resolve(process.env.EXECUTION_HOST || argv.options.sandbox);
    }
    const configFile = fs.readFileSync(CONFIG_FILE).toString();
    config = { ...config, ...yaml.load(configFile) as any };
}
