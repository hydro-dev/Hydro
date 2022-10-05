/* eslint-disable no-await-in-loop */
import Schema from 'schemastery';
import { STATUS } from '../model/builtin';
import storage from '../model/storage';

export async function run(_, report) {
    const cursor = storage.coll.find({ path: { $regex: /^problem\//i } }).sort({ path: 1 });
    const count = await cursor.count();
    report({ message: `Total ${count} files` });
    let current = '';
    let memory = 0;
    let start = new Date().getTime();
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const doc = await cursor.next();
        const id = doc?.path.split('problem/')[1].split('/')[0]!;
        if (!current) current = id;
        if (!doc || current !== id) {
            const end = new Date().getTime();
            report({
                case: {
                    message: current,
                    memory: Math.floor(memory / 102.4) / 10,
                    time: end - start,
                    status: STATUS.STATUS_ACCEPTED,
                    score: 0,
                },
            });
            start = end;
            memory = 0;
            current = id;
            if (!doc) break;
        }
        memory += doc.size || 0;
    }
    return true;
}

export const apply = (ctx) => ctx.addScript('storageUsage', 'Calculate storage usage', Schema.any(), run);
