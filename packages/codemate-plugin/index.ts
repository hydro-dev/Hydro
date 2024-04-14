import fs from 'fs';
import path from 'path';
import { Context, unwrapExports } from 'hydrooj';

export default async function apply(ctx: Context) {
    fs.readdir('./plugins/', (err, files) => {
        if (err) throw err;
        for (const plugin of files) {
            const pluginPath = path.join('./plugins/', plugin);
            if (fs.statSync(pluginPath).isDirectory()) {
                if (fs.existsSync(`${pluginPath}/index.ts`)) {
                    // eslint-disable-next-line import/no-dynamic-require
                    const _ = require(`${pluginPath}/index.ts`);
                    _?.apply?.(ctx);
                    unwrapExports(_);
                }
            } else {
                // eslint-disable-next-line import/no-dynamic-require
                const _ = require(pluginPath);
                _?.apply?.(ctx);
                unwrapExports(_);
            }
        }
    });
}
