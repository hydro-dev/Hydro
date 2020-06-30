const description = 'Recalcuates nSubmit and nAccept in problem status.';

const db = require('../service/db');
const { STATUS_ACCEPTED } = require('../model/builtin').STATUS;
const document = require('../model/document');

async function run() {
    const pipeline = [
        {
            $match: { hidden: false, type: { $ne: 'run' } },
        },
        {
            $group: {
                _id: { domainId: '$domainId', pid: '$pid', uid: '$uid' },
                nSubmit: { $sum: 1 },
                nAccept: {
                    $sum: {
                        $cond: [{ $eq: ['$status', STATUS_ACCEPTED] }, 1, 0],
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
    db.collection('record').aggregate(pipeline).forEach(
        (adoc) => bulk.find({
            domainId: adoc._id.domainId,
            docType: document.TYPE_PROBLEM,
            docId: adoc._id.pid,
        }).updateOne({
            $set: {
                nSubmit: adoc.nSubmit,
                nAccept: adoc.nAccept,
            },
        }),
    );
    await bulk.execute();
}

global.Hydro.script.problemStat = module.exports = { run, description };
