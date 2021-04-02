import path from 'path';
import fs from 'fs-extra';
import { argv } from 'yargs';
import { Logger } from './log';
import { getConfig } from './config';

const logger = new Logger('cache');

export = function main() {
    const CACHE_DIR = getConfig('cache_dir');
    if (argv._[1] === 'clean') {
        fs.emptyDirSync(CACHE_DIR);
        logger.info('Cleaned cache.');
    } else if (argv._[1] === 'prune') {
        const duration = +argv.duration || 30;
        const now = new Date().getTime();
        const hosts = fs.readdirSync(CACHE_DIR);
        let cnt = 0;
        for (const host of hosts) {
            const hostdir = path.resolve(CACHE_DIR, host);
            if (!fs.statSync(hostdir).isDirectory()) continue;
            const domains = fs.readdirSync(hostdir);
            for (const domain of domains) {
                const domaindir = path.resolve(hostdir, domain);
                if (!fs.statSync(domaindir).isDirectory()) continue;
                let problems = fs.readdirSync(domaindir);
                for (const problem of problems) {
                    const problemdir = path.resolve(domaindir, problem);
                    if (!fs.statSync(problemdir).isDirectory()) continue;
                    let lastUsage = 0;
                    if (fs.existsSync(path.resolve(problemdir, 'lastUsage'))) {
                        const content = fs.readFileSync(path.resolve(problemdir, 'lastUsage')).toString();
                        lastUsage = +content || 0;
                    }
                    if (lastUsage + duration * 24 * 3600 * 1000 > now) continue;
                    fs.removeSync(problemdir);
                    cnt++;
                    logger.info('Removed cache %s', problemdir);
                }
                problems = fs.readdirSync(domaindir);
                if (!problems.length) fs.removeSync(domaindir);
            }
        }
        logger.info('Done! %d items deleted.', cnt);
    }
};
