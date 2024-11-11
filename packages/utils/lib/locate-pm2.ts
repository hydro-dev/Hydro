import fs from 'fs';
import path from 'path';

const PATH = process.env.PATH?.split(':') || [];

/* eslint-disable import/no-dynamic-require */
// @ts-ignore
const pm2: typeof import('pm2') | null = (() => {
    for (const dir of PATH) {
        try {
            const info = fs.readlinkSync(path.resolve(dir, 'pm2'));
            const p = path.resolve(dir, info);
            if (p.startsWith('/nix')) return require(`${p.split('/bin')[0]}/lib/node_modules/pm2`);
            // installed by yarn
            return require(`${p.split('.bin')[0]}pm2`); // eslint-disable-line import/no-dynamic-require
        } catch (e) { }
    }
    return null;
})();

export default pm2;
