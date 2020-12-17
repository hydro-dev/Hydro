/* eslint-disable no-await-in-loop */
import { ObjectID, Collection } from 'mongodb';
import { terminal } from 'terminal-kit';
import { Ufdoc } from './interface';
import { Logger } from './logger';
import gridfs from './service/gridfs';
import storage from './service/storage';
import db from './service/db';
import * as problem from './model/problem';
import * as domain from './model/domain';
import * as document from './model/document';

const logger = new Logger('upgrade');
type UpgradeScript = () => Promise<boolean | void>;

const scripts: UpgradeScript[] = [
    // Init
    async function _0_1() {
        const ddoc = await domain.get('system');
        if (!ddoc) await domain.add('system', 0, 'Hydro', 'Hydro System');
        // TODO discussion node?
        return true;
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
        return true;
    },
    async function _2_3() {
        await db.collection('document').updateMany({ pid: /^\d+$/i }, { $unset: { pid: '' } });
        return true;
    },
    async function _3_4() {
        if (storage.error) {
            logger.error('Cannot upgrade. Please change storage config.');
            return false;
        }

        const coll: Collection<Ufdoc> = db.collection('file');
        const collFile = db.collection('fs.files');
        const collChunk = db.collection('fs.chunks');
        function del(_id: ObjectID) {
            return Promise.all([
                coll.deleteOne({ _id }),
                collFile.deleteOne({ _id }),
                collChunk.deleteMany({ files_id: _id }),
            ]);
        }
        async function get(_id: ObjectID, reject?: Function) {
            const stream = gridfs.openDownloadStream(_id);
            stream.on('error', (err) => {
                console.error(err);
                if (reject) reject(err);
            });
            return stream;
        }
        terminal.clear('Upgrade');
        logger.info('');
        // Problem file and User file
        // @ts-ignore
        const progress = terminal.progressBar({ title: 'Changing storage engine. This may take a long time.', y: 1 });
        const ddocs = await domain.getMulti().toArray();
        const totalProgress = terminal.progressBar({
            // @ts-ignore
            items: ddocs.length, title: 'Domain', y: 3, eta: true,
        });
        for (let i = 0; i < ddocs.length; i++) {
            const ddoc = ddocs[i];
            totalProgress.startItem(ddoc._id);
            const pdocs = await problem.getMulti(ddoc._id, { data: { $ne: null } }, ['docId', 'data', 'title']).toArray();
            // @ts-ignore
            const domainProgress = terminal.progressBar({
                // @ts-ignore
                items: pdocs.length, title: 'Problems', y: 4, eta: true,
            });
            for (let j = 0; j < pdocs.length; j++) {
                const pdoc = pdocs[j];
                domainProgress.startItem(`${pdoc.docId}: ${pdoc.title}`);
                // TODO copy file
                domainProgress.itemDone(`${pdoc.docId}: ${pdoc.title}`);
            }
            domainProgress.stop();
            totalProgress.itemDone(ddoc._id);
        }
        totalProgress.stop();
        // TODO userfile
        progress.stop();
        return false;
    },
];

export = scripts;
