import fs from 'fs';
import path from 'path';
import { Context } from 'hydrooj';

export default async function apply(ctx: Context) {
    fs.readdir('./plugins/', (err, files) => {
        if (err) throw err;
        for (const plugin of files) {
            const pluginPath = path.join('./plugins/', plugin);
            if (fs.statSync(pluginPath).isDirectory()) {
                // eslint-disable-next-line import/no-dynamic-require
                if (fs.existsSync(`${pluginPath}/index.ts`)) require(`${pluginPath}/index.ts`).apply?.(ctx);
            } else {
                // eslint-disable-next-line import/no-dynamic-require
                require(pluginPath).apply?.(ctx);
            }
        }
    });
}
