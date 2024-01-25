/* eslint-disable no-await-in-loop */
import './utils';

import path from 'path';
import cac from 'cac';
import {
    Counter, folderSize, fs, size,
} from '@hydrooj/utils';
import { getConfig } from './config';
import { Logger } from './log';

const argv = cac().parse();
const logger = new Logger('cache');

export = async function main() {
    const CACHE_DIR = getConfig('cache_dir');
    if (argv.args[1] === 'clean') {
        fs.emptyDirSync(CACHE_DIR);
        logger.info('Cleaned cache.');
    } else if (argv.args[1] === 'prune') {
        const duration = +argv.options.duration || 30;
        const now = Date.now();
        const hosts = await fs.readdir(CACHE_DIR, { withFileTypes: true });
        let cnt = 0;
        let totalSize = 0;
        const map = Counter();
        for (const host of hosts) {
            const hostdir = path.resolve(CACHE_DIR, host.name);
            if (!host.isDirectory()) continue;
            const domains = await fs.readdir(hostdir, { withFileTypes: true });
            for (const domain of domains) {
                if (!domain.isDirectory()) continue;
                const domaindir = path.resolve(hostdir, domain.name);
                const problems = await fs.readdir(domaindir, { withFileTypes: true });
                if (problems.find((i) => i.name === '.skip-prune')) continue;
                for (const problem of problems) {
                    const problemdir = path.resolve(domaindir, problem.name);
                    if (!fs.statSync(problemdir).isDirectory()) continue;
                    let lastUsage = 0;
                    if (fs.existsSync(path.resolve(problemdir, 'lastUsage'))) {
                        const content = await fs.readFile(path.resolve(problemdir, 'lastUsage'), 'utf-8');
                        lastUsage = +content || 0;
                    }
                    if (lastUsage + duration * 24 * 3600 * 1000 > now) continue;
                    const cursize = folderSize(problemdir);
                    const etags = path.resolve(problemdir, 'etags');
                    if (fs.existsSync(etags)) await fs.unlink(etags);
                    await fs.remove(problemdir);
                    cnt++;
                    totalSize += cursize;
                    map[domain.name] += cursize;
                    logger.info('Removed cache %s (%s)', problemdir, size(cursize));
                }
                if (!(await fs.readdir(domaindir)).length) await fs.remove(domaindir);
            }
        }
        logger.info('Done! %d items deleted, %s freed.', cnt, size(totalSize));
        const top10 = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 10);
        for (const [domain, s] of top10) {
            logger.info('  %s: %s', domain, size(s));
        }
    }
};
