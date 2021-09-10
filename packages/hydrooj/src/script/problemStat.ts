/* eslint-disable no-await-in-loop */
import { STATUS } from '../model/builtin';
import * as document from '../model/document';
import db from '../service/db';

export const description = 'Recalculates nSubmit and nAccept in problem status.';

const sumStatus = (status) => ({ $sum: { $cond: [{ $eq: ['$status', status] }, 1, 0] } });

export async function udoc(report) {
    report({ message: 'Udoc' });
    const pipeline = [
        { $match: { hidden: false, type: { $ne: 'run' } } },
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
    let bulk = db.collection('domain.user').initializeUnorderedBulkOp();
    const cursor = db.collection('record').aggregate(pipeline, { allowDiskUse: true });
    while (await cursor.hasNext()) {
        const adoc = await cursor.next() as any;
        bulk.find({
            domainId: adoc._id.domainId,
            uid: adoc._id.uid,
        }).updateOne({
            $set: {
                nSubmit: adoc.nSubmit,
                nAccept: adoc.nAccept,
            },
        });
        if (bulk.length > 100) {
            await bulk.execute();
            bulk = db.collection('domain.user').initializeUnorderedBulkOp();
        }
    }
    if (bulk.length) await bulk.execute();
}

export async function psdoc(report) {
    report({ message: 'Psdoc' });
    const pipeline = [
        { $match: { hidden: false, type: { $ne: 'run' } } },
        {
            $group: {
                _id: { domainId: '$domainId', pid: '$pid', uid: '$uid' },
                nSubmit: { $sum: 1 },
            },
        },
    ];
    const data = db.collection('record').aggregate(pipeline, { allowDiskUse: true });
    while (await data.hasNext()) {
        const adoc = await data.next() as any;
        await document.setStatus(adoc._id.domainId, document.TYPE_PROBLEM, adoc._id.pid, adoc._id.uid, { nSubmit: adoc.nSubmit });
    }
}

export async function pdoc(report) {
    report({ message: 'Pdoc' });
    const pipeline = [
        { $match: { hidden: false, type: { $ne: 'run' } } },
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
        pipeline[1].$group[`s${i}`] = { $sum: { $cond: [{ $eq: ['$score', i] }, 1, 0] } };
        pipeline[2].$group[`s${i}`] = { $sum: `$s${i}` };
    }
    let bulk = db.collection('document').initializeUnorderedBulkOp();
    const data = db.collection('record').aggregate(pipeline, { allowDiskUse: true });
    let cnt = 0;
    while (await data.hasNext()) {
        const adoc = await data.next() as any;
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
        if (bulk.length > 100) {
            await bulk.execute();
            cnt++;
            report({ message: `${cnt * 100} pdocs updated` });
            bulk = db.collection('document').initializeUnorderedBulkOp();
        }
    }
    if (bulk.length) await bulk.execute();
}

export async function run(arg, report) {
    if (arg.pdoc === undefined || arg.pdoc) await pdoc(report);
    if (arg.udoc === undefined || arg.udoc) await udoc(report);
    if (arg.psdoc === undefined || arg.psdoc) await psdoc(report);
    return true;
}

export const validate = {
    udoc: 'boolean?',
    pdoc: 'boolean?',
    psdoc: 'boolean?',
};

global.Hydro.script.problemStat = { run, description, validate };
