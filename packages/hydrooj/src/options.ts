import fs from 'fs';
import os from 'os';
import path from 'path';
import { findFileSync } from '@hydrooj/utils/lib/utils';
import { Logger } from './logger';

const logger = new Logger('options');

export = function load() {
    const envFile = path.resolve(os.homedir(), '.hydro', 'env');
    if (fs.existsSync(envFile)) {
        const content = fs.readFileSync(envFile).toString().replace(/\r/g, '');
        for (const line of content.split('\n')) {
            if (!line.includes('=')) continue;
            process.env[line.split('=')[0]] = line.split('=')[1].trim();
        }
    }
    const f = findFileSync('config.json', false);
    if (!f) return null;
    let result: any = {};
    try {
        result = JSON.parse(fs.readFileSync(f).toString());
    } catch (e) {
        logger.error('Cannot read config file %o', e);
        result = {};
    }
    return result;
};
