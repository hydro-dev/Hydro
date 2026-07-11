import Schema from 'schemastery';
import { STATUS } from '../model/builtin';
import * as document from '../model/document';
import RecordModel from '../model/record';
import db from '../service/db';

const sumStatus = (status) => ({ $sum: { $cond: [{ $eq: ['$status', status] }, 1, 0] } });

export async function udoc(report) {
    const userStats = new Map<string, { nLiked?: number, nAccept?: number, nSubmit?: number }>();

    report({ message: 'Udoc nLiked' });
    const likedPipeline = [
        {
            $match: {
                docType: document.TYPE_PROBLEM_SOLUTION,
                vote: { $gt: 0 },
            },
        },
        {
            $group: {
                _id: { domainId: '$domainId', uid: '$owner' },
                nLiked: { $sum: '$vote' },
            },
        },
    ];
    for await (const adoc of document.coll.aggregate<any>(likedPipeline, { allowDiskUse: true })) {
        userStats.set(`${adoc._id.domainId}/${adoc._id.uid}`, { nLiked: adoc.nLiked });
    }

    report({ message: 'Udoc' });
    const pipeline = [
        {
            $match: {
                contest: { $nin: [RecordModel.RECORD_PRETEST, RecordModel.RECORD_GENERATE] },
                status: { $ne: STATUS.STATUS_CANCELED },
                uid: { $gte: 0 },
            },
        },
        {
            $group: {
                _id: { domainId: '$domainId', pid: '$pid', uid: '$uid' },
                nSubmit: { $sum: 1 },
                nAccept: sumStatus(STATUS.STATUS_ACCEPTED),
            },
        },
        {
            $group: {
                _id: { domainId: '$_id.domainId', uid: '$_id.uid' },
                nSubmit: { $sum: { $min: ['$nSubmit', 1] } },
                nAccept: { $sum: { $min: ['$nAccept', 1] } },
            },
        },
    ];
    for await (const adoc of db.collection('record').aggregate<any>(pipeline, { allowDiskUse: true })) {
        const key = `${adoc._id.domainId}/${adoc._id.uid}`;
        const stat = userStats.get(key) || {};
        stat.nSubmit = adoc.nSubmit;
        stat.nAccept = adoc.nAccept;
        userStats.set(key, stat);
    }

    let bulk = db.collection('domain.user').initializeUnorderedBulkOp();
    for (const [key, stat] of userStats) {
        const [domainId, uid] = key.split('/');
        bulk.find({ domainId, uid: +uid }).updateOne({
            $set: {
                nSubmit: stat.nSubmit || 0,
                nAccept: stat.nAccept || 0,
                nLiked: stat.nLiked || 0,
            },
        });
        if (bulk.batches.length > 100) {
            await bulk.execute(); // eslint-disable-line no-await-in-loop
            bulk = db.collection('domain.user').initializeUnorderedBulkOp();
        }
    }
    if (bulk.batches.length) await bulk.execute();
}

export async function pdoc(report) {
    report({ message: 'Pdoc' });
    const pipeline = [
        {
            $match: {
                contest: { $nin: [RecordModel.RECORD_PRETEST, RecordModel.RECORD_GENERATE] },
                status: { $ne: STATUS.STATUS_CANCELED },
            },
        },
        {
            $group: {
                _id: { domainId: '$domainId', pid: '$pid', uid: '$uid' },
                nSubmit: { $sum: 1 },
                nAccept: sumStatus(STATUS.STATUS_ACCEPTED),
                WA: sumStatus(STATUS.STATUS_WRONG_ANSWER),
                TLE: sumStatus(STATUS.STATUS_TIME_LIMIT_EXCEEDED),
                MLE: sumStatus(STATUS.STATUS_MEMORY_LIMIT_EXCEEDED),
                RE: sumStatus(STATUS.STATUS_RUNTIME_ERROR),
                SE: sumStatus(STATUS.STATUS_SYSTEM_ERROR),
                IGN: sumStatus(STATUS.STATUS_CANCELED),
                CE: sumStatus(STATUS.STATUS_COMPILE_ERROR),
            },
        },
        {
            $group: {
                _id: { domainId: '$_id.domainId', pid: '$_id.pid' },
                nSubmit: { $sum: '$nSubmit' },
                nAccept: { $sum: { $min: ['$nAccept', 1] } },
                AC: { $sum: '$nAccept' },
                WA: { $sum: '$WA' },
                TLE: { $sum: '$TLE' },
                MLE: { $sum: '$MLE' },
                RE: { $sum: '$RE' },
                SE: { $sum: '$SE' },
                IGN: { $sum: '$IGN' },
                CE: { $sum: '$CE' },
            },
        },
    ];
    for (let i = 0; i <= 100; i++) {
        pipeline[1].$group[`s${i}`] = {
            $sum: {
                $cond: [{
                    $and: [
                        { $gte: ['$score', i] },
                        { $lt: ['$score', i + 1] },
                    ],
                }, 1, 0],
            },
        };
        pipeline[2].$group[`s${i}`] = { $sum: `$s${i}` };
    }
    let bulk = db.collection('document').initializeUnorderedBulkOp();
    const data = db.collection('record').aggregate<any>(pipeline, { allowDiskUse: true });
    let cnt = 0;
    for await (const adoc of data) {
        const $set = {
            nSubmit: adoc.nSubmit,
            nAccept: adoc.nAccept,
            stats: {
                AC: adoc.AC,
                WA: adoc.WA,
                TLE: adoc.TLE,
                MLE: adoc.MLE,
                RE: adoc.RE,
                SE: adoc.SE,
                IGN: adoc.IGN,
                CE: adoc.CE,
            },
        };
        for (let i = 0; i <= 100; i++) if (adoc[`s${i}`]) $set.stats[`s${i}`] = adoc[`s${i}`];
        bulk.find({
            domainId: adoc._id.domainId,
            docType: document.TYPE_PROBLEM,
            docId: adoc._id.pid,
        }).updateOne({ $set });
        if (bulk.batches.length > 100) {
            await bulk.execute();
            cnt++;
            report({ message: `${cnt * 100} pdocs updated` });
            bulk = db.collection('document').initializeUnorderedBulkOp();
        }
    }
    if (bulk.batches.length) await bulk.execute();
}

export const apply = (ctx) => ctx.addScript(
    'problemStat', 'Recalculates nSubmit and nAccept in problem status.',
    Schema.object({
        udoc: Schema.boolean(),
        pdoc: Schema.boolean(),
        psdoc: Schema.boolean(),
    }),
    async (arg, report) => {
        if (arg.pdoc === undefined || arg.pdoc) {
            const start = Date.now();
            await pdoc(report);
            report({ message: `pdoc finished in ${Date.now() - start}ms` });
        }
        if (arg.udoc === undefined || arg.udoc) {
            const start = Date.now();
            await udoc(report);
            report({ message: `udoc finished in ${Date.now() - start}ms` });
        }
        return true;
    },
);
