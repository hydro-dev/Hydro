import db from '../service/db';
import { STATUS } from '../model/builtin';
import * as document from '../model/document';

export const description = 'Recalcuates nSubmit and nAccept in problem status.';

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
    const bulk = db.collection('domain.user').initializeUnorderedBulkOp();
    db.collection('record').aggregate(pipeline).each(
        (err, adoc: any) => {
            if (adoc) {
                bulk.find({
                    domainId: adoc._id.domainId,
                    uid: adoc._id.uid,
                }).updateOne({
                    $set: {
                        nSubmit: adoc.nSubmit,
                        nAccept: adoc.nAccept,
                    },
                });
            }
        },
    );
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
    const bulk = db.collection('document').initializeUnorderedBulkOp();
    db.collection('record').aggregate(pipeline).each(
        (err, adoc: any) => {
            if (adoc) {
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
            }
        },
    );
    if (bulk.length) await bulk.execute();
}

export async function run() {
    return await Promise.all([udoc(), pdoc()]);
}

export const validate = {};

global.Hydro.script.problemStat = { run, description, validate };
