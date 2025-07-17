import child from 'child_process';
import path from 'path';
import { CAC } from 'cac';
import fs from 'fs-extra';
import superagent from 'superagent';
import { Logger } from '@hydrooj/utils';

const logger = new Logger('patch');

export function register(cli: CAC) {
    cli.command('patch <module> <patch>').action(async (filename, patch) => {
        const mod = require.resolve(filename);
        if (!mod) {
            logger.error('Module %s not found', filename);
            return;
        }
        logger.info('Patching %s', mod);
        let content = '';
        if (patch.startsWith('http')) {
            const res = await superagent.get(patch).responseType('arraybuffer');
            logger.info('Downloaded patch');
            content = res.body;
        } else {
            content = await fs.readFile(patch, 'utf-8');
        }
        for (let i = 0; i <= 100; i++) {
            const fp = path.join(path.dirname(mod), `${path.basename(mod)}.${i}.patch`);
            if (fs.existsSync(fp)) continue;
            patch = fp;
            break;
        }
        await fs.writeFile(patch, content);
        child.execSync(`patch ${mod} -o ${mod}.tmp < ${patch}`);
        await fs.move(`${mod}.tmp`, mod, { overwrite: true });
        logger.info('Patched %s', mod);
    });

    // TODO: support revert patch
}
