import Schema from 'schemastery';
import { STATUS } from '../model/builtin';
import storage from '../model/storage';

export async function run(_, report) {
    let totalProblemSize = 0;
    const m = await storage.coll.aggregate([
        { $match: { path: { $regex: /^problem\//i } } },
        { $addFields: { domainId: { $arrayElemAt: [{ $split: ['$path', '/'] }, 1] } } },
        { $group: { _id: '$domainId', size: { $sum: '$size' }, count: { $sum: 1 } } },
        { $match: { size: { $gt: 10 * 1024 * 1024 } } },
        { $sort: { size: -1 } },
    ]).toArray();
    for (let i = 0; i < m.length; i++) {
        const message = m[i]._id;
        report({
            case: {
                id: i + 1,
                message,
                memory: Math.floor(m[i].size / 102.4) / 10,
                time: 0,
                status: STATUS.STATUS_ACCEPTED,
                score: 0,
            },
        });
        totalProblemSize += m[i].size;
    }
    report({ message: `Problem total ${totalProblemSize / 1024 / 1024} MB` });
    return true;
}

export const apply = (ctx) => ctx.addScript('storageUsage', 'Calculate storage usage', Schema.any(), run);
