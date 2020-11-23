/* eslint-disable no-await-in-loop */
import * as domain from './model/domain';
import * as document from './model/document';
import { db } from './service/db';

type UpgradeScript = () => Promise<void>;

const scripts: UpgradeScript[] = [
    // Init
    async function _0_1() {
        const ddoc = await domain.get('system');
        if (!ddoc) await domain.add('system', 0, 'Hydro', 'Hydro System');
        // TODO discussion node?
    },
    // Add history column to ddoc,drdoc,psdoc
    async function _1_2() {
        const domains = await domain.getMulti().project({ _id: 1 }).toArray();
        for (const d of domains) {
            const bulk = document.coll.initializeUnorderedBulkOp();
            await document.getMulti(d._id, document.TYPE_DISCUSSION).forEach((ddoc) => {
                bulk.find({ _id: ddoc._id }).updateOne({ $set: { history: [] } });
            });
            await document.getMulti(d._id, document.TYPE_DISCUSSION_REPLY).forEach((drdoc) => {
                bulk.find({ _id: drdoc._id }).updateOne({ $set: { history: [] } });
            });
            // TODO tail reply
            await document.getMulti(d._id, document.TYPE_PROBLEM_SOLUTION).forEach((psdoc) => {
                bulk.find({ _id: psdoc._id }).updateOne({ $set: { history: [] } });
            });
            if (bulk.length) await bulk.execute();
        }
    },
    async function _2_3() {
        await db.collection('document').updateMany({ pid: /^\d+$/i }, { $unset: { pid: '' } });
    },
];

export = scripts;
