/* eslint-disable no-await-in-loop */
import db from '../service/db';
import { STATUS } from '../model/builtin';
import * as document from '../model/document';

export const description = 'Recalculates nSubmit and nAccept in problem status.';

export async function udoc() {
    const pipeline = [
        { $match: { hidden: false, type: { $ne: 'run' } } },
        {
            $group: {
                _id: { domainId: '$domainId', pid: '$pid', uid: '$uid' },
                nSubmit: { $sum: 1 },
                nAccept: {
                    $sum: {
                        $cond: [{ $eq: ['$status', STATUS.STATUS_ACCEPTED] }, 1, 0],
                    },
                },
            },
        },
        {
            $group: {
                _id: { domainId: '$_id.domainId', uid: '$_id.uid' },
                nSubmit: { $sum: '$nSubmit' },
                nAccept: { $sum: { $min: ['$nAccept', 1] } },
            },
        },
    ];
    let bulk = db.collection('domain.user').initializeUnorderedBulkOp();
    const cursor = db.collection('record').aggregate(pipeline);
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

export async function pdoc() {
    const pipeline = [
        { $match: { hidden: false, type: { $ne: 'run' } } },
        {
            $group: {
                _id: { domainId: '$domainId', pid: '$pid', uid: '$uid' },
                nSubmit: { $sum: 1 },
                nAccept: {
                    $sum: {
                        $cond: [{ $eq: ['$status', STATUS.STATUS_ACCEPTED] }, 1, 0],
                    },
                },
            },
        },
        {
            $group: {
                _id: { domainId: '$_id.domainId', pid: '$_id.pid' },
                nSubmit: { $sum: '$nSubmit' },
                nAccept: { $sum: { $min: ['$nAccept', 1] } },
            },
        },
    ];
    let bulk = db.collection('document').initializeUnorderedBulkOp();
    const data = db.collection('record').aggregate(pipeline);
    while (await data.hasNext()) {
        const adoc = await data.next() as any;
        bulk.find({
            domainId: adoc._id.domainId,
            docType: document.TYPE_PROBLEM,
            docId: adoc._id.pid,
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

export async function run() {
    return await Promise.all([udoc(), pdoc()]);
}

export const validate = {};

global.Hydro.script.problemStat = { run, description, validate };
