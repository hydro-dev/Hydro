import fs from 'fs';
import os from 'os';
import path from 'path';
import { Logger } from './logger';

const logger = new Logger('options');

export = function load() {
    const envFile = path.resolve(os.homedir(), '.hydro', 'env');
    if (fs.existsSync(envFile)) {
        const content = fs.readFileSync(envFile).toString();
        for (const line of content.split('\n')) {
            process.env[line.split('=')[0]] = line.split('=')[1];
        }
    }

    let f = path.resolve(process.cwd(), 'config.json');
    if (!fs.existsSync(f)) f = path.resolve(__dirname, 'config.json');
    if (!fs.existsSync(f)) f = path.resolve(os.homedir(), '.config', 'hydro', 'config.json');
    if (!fs.existsSync(f)) f = path.resolve(os.homedir(), '.hydro', 'config.json');
    if (!fs.existsSync(f)) f = path.resolve('/config/config.json');
    if (!fs.existsSync(f)) return null;
    let result: any = {};
    try {
        result = JSON.parse(fs.readFileSync(f).toString());
    } catch (e) {
        logger.error('Cannot read config file %o', e);
        result = {};
    }
    return result;
}
