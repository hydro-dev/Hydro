/* eslint-disable no-await-in-loop */
import { ObjectID, Collection } from 'mongodb';
import { terminal } from 'terminal-kit';
import AdmZip from 'adm-zip';
import { Ufdoc } from './interface';
import { Logger } from './logger';
import { streamToBuffer } from './utils';
import gridfs from './service/gridfs';
import storage from './service/storage';
import db from './service/db';
import * as problem from './model/problem';
import * as user from './model/user';
import * as domain from './model/domain';
import * as document from './model/document';
import * as system from './model/system';

declare module 'terminal-kit/Terminal' {
    interface ProgressBarOptions {
        y?: number;
    }
}

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
        logger.info('Changing storage engine. This may take a long time.');
        // Problem file and User file
        try {
            let savedProgress = system.get('upgrade.file.progress.domain');
            if (savedProgress) savedProgress = JSON.parse(savedProgress);
            else savedProgress = { pdocs: [] };
            const ddocs = await domain.getMulti().project({ _id: 1 }).toArray();
            logger.info('Total found %d domains.', ddocs.length);
            for (let i = 0; i < ddocs.length; i++) {
                const ddoc = ddocs[i];
                logger.info('Domain %s (%d/%d)', ddoc._id, i + 1, ddocs.length);
                const pdocs = await problem.getMulti(ddoc._id, { data: { $ne: null } }, ['domainId', 'docId', 'data', 'title']).toArray();
                const domainProgress = terminal.progressBar({ items: pdocs.length, title: 'Problems', inline: true });
                for (let j = 0; j < pdocs.length; j++) {
                    const pdoc = pdocs[j];
                    domainProgress.startItem(`${pdoc.docId}: ${pdoc.title}`);
                    if (!savedProgress.pdocs.includes(`${pdoc.domainId}/${pdoc.docId}`) && pdoc.data instanceof ObjectID) {
                        try {
                            const file = await streamToBuffer(gridfs.openDownloadStream(pdoc.data));
                            const zip = new AdmZip(file);
                            const entries = zip.getEntries();
                            await Promise.all(entries.map(
                                (entry) => storage.put(`problem/${pdoc.domainId}/${pdoc.docId}/testdata/${entry.name}`, entry.getData()),
                            ));
                        } catch (e) {
                            if (e.toString().includes('FileNotFound')) {
                                logger.error('Problem data not found %s/%s', pdoc.domainId, pdoc.docId);
                            } else throw e;
                        }
                        savedProgress.pdocs.push(`${pdoc.domainId}/${pdoc.docId}`);
                    }
                    system.set('upgrade.file.progress.domain', JSON.stringify(savedProgress));
                    domainProgress.itemDone(`${pdoc.docId}: ${pdoc.title}`);
                }
                domainProgress.stop();
            }
            const udocs = await user.getMulti().project({ _id: 1, uname: 1 }).toArray();
            const userfileProgress = terminal.progressBar({
                items: udocs.length, title: 'Users', y: 3,
            });
            for (const udoc of udocs) {
                userfileProgress.startItem(`${udoc._id}: ${udoc.uname}`);
                const ufdocs = await coll.find({ owner: udoc._id }).toArray();
                const currentUser = terminal.progressBar({
                    items: ufdocs.length, title: `${udoc._id}: ${udoc.uname}`, y: 4, eta: true,
                });
                const namelist = [];
                for (const ufdoc of ufdocs) {
                    currentUser.startItem(`${ufdoc._id}: ${ufdoc.filename || ''}`);
                    ufdoc.filename = ufdoc.filename || ufdoc._id.toHexString();
                    const file = await streamToBuffer(gridfs.openDownloadStream(ufdoc._id));
                    if (!namelist.includes(ufdoc.filename)) {
                        await storage.put(`user/${udoc._id}/${ufdoc.filename}`, file);
                    } else {
                        await storage.put(`user/${udoc._id}/${ufdoc._id}`, file);
                    }
                    namelist.push(ufdoc.filename);
                    currentUser.itemDone(`${ufdoc._id}: ${ufdoc.filename || ''}`);
                }
                currentUser.stop();
                userfileProgress.itemDone(`${udoc._id}: ${udoc.uname}`);
            }
            userfileProgress.stop();
            return true;
        } catch (e) {
            logger.error(e);
            return false;
        }
    },
];

export = scripts;
