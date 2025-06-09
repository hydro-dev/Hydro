/* eslint-disable no-await-in-loop */
import { resolve } from 'path';
import {
    existsSync, mkdir, readdir, rename, rmdir,
} from 'fs-extra';
import Schema from 'schemastery';
import { Context } from '../context';

export const apply = (ctx: Context) => ctx.addScript(
    'fixStorage', 'Rename all files to lowercase',
    Schema.object({}),
    async () => {
        const config = await ctx.get('storage').status();
        console.log(config);
        if (config.type !== 'Local') throw new Error('Only local storage is supported');
        const dir = (config as any).dir;
        if (!dir) throw new Error('Storage dir not found');
        const files = await readdir(dir);
        for (const file of files) {
            let inner = await readdir(resolve(dir, file));
            if (file.toLowerCase() !== file && !existsSync(resolve(dir, file.toLowerCase()))) {
                await mkdir(resolve(dir, file.toLowerCase()));
                console.log('+: ', resolve(dir, file.toLowerCase()));
            }
            for (const f of inner) {
                if (resolve(dir, file, f) === resolve(dir, file.toLowerCase(), f.toLowerCase())) continue;
                await rename(resolve(dir, file, f), resolve(dir, file.toLowerCase(), f.toLowerCase()));
                console.log('R: ', resolve(dir, file, f), '->', resolve(dir, file.toLowerCase(), f.toLowerCase()));
            }
            inner = await readdir(resolve(dir, file));
            if (!inner.length) {
                await rmdir(resolve(dir, file));
                console.log('-: ', resolve(dir, file));
            }
        }
        const coll = ctx.get('db').collection('storage');
        while (true) {
            let hasItem = false;
            for await (const t of coll.find({ $or: [{ _id: /[A-Z]/ }, { link: /[A-Z]/ }] })) {
                hasItem = true;
                await coll.insertOne({
                    ...t,
                    _id: t._id.toLowerCase(),
                    ...(t.link ? { link: t.link.toLowerCase() } : {}),
                });
                await coll.deleteOne({ _id: t._id });
                console.log('Q: ', t._id, '->', t._id.toLowerCase());
            }
            if (!hasItem) break;
        }
        return true;
    },
);
