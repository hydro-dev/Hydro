import fs from 'fs';
import path from 'path';

const PATH = process.env.PATH?.split(':') || [];

// @ts-ignore
const pm2: typeof import('pm2') | null = (() => {
    for (const dir of PATH) {
        try {
            const info = fs.readlinkSync(path.resolve(dir, 'pm2'));
            const p = path.resolve(dir, info);
            return require(`${p.split('.bin')[0]}pm2`); // eslint-disable-line import/no-dynamic-require
        } catch (e) { }
    }
    return null;
})();

export default pm2;
