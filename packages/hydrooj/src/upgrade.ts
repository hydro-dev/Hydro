/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-await-in-loop */
import { ObjectID, Collection } from 'mongodb';
import AdmZip from 'adm-zip';
import Queue from 'p-queue';
import { Progress } from './ui';
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

const logger = new Logger('upgrade');
type UpgradeScript = () => Promise<boolean | void>;

const scripts: UpgradeScript[] = [
    // Init
    async function _0_1() {
        const ddoc = await domain.get('system');
        if (!ddoc) await domain.add('system', 1, 'Hydro', 'Hydro System');
        // TODO discussion node?
        return true;
    },
    // Add history column to ddoc,drdoc,psdoc
    async function _1_2() {
        const _FRESH_INSTALL_IGNORE = 1;
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
        const _FRESH_INSTALL_IGNORE = 1;
        await db.collection('document').updateMany({ pid: /^\d+$/i }, { $unset: { pid: '' } });
        return true;
    },
    async function _3_4() {
        const _FRESH_INSTALL_IGNORE = 1;
        if (storage.error) {
            logger.error('Cannot upgrade. Please change storage config.');
            return false;
        }
        const coll: Collection<Ufdoc> = db.collection('file');
        logger.info('Changing storage engine. This may take a long time.');
        // Problem file and User file
        let savedProgress = system.get('upgrade.file.progress.domain');
        if (savedProgress) savedProgress = JSON.parse(savedProgress);
        else savedProgress = { pdocs: [] };
        const ddocs = await domain.getMulti().project({ _id: 1 }).toArray();
        logger.info('Total found %d domains.', ddocs.length);
        for (let i = 0; i < ddocs.length; i++) {
            const ddoc = ddocs[i];
            logger.info('Domain %s (%d/%d)', ddoc._id, i + 1, ddocs.length);
            const pdocs = await problem.getMulti(ddoc._id, { data: { $ne: null } }, ['domainId', 'docId', 'data', 'title']).toArray();
            const domainProgress = Progress.create({ items: pdocs.length, title: 'Problems', inline: true });
            for (let j = 0; j < pdocs.length; j++) {
                const pdoc = pdocs[j];
                domainProgress.startItem(`${pdoc.docId}: ${pdoc.title}`);
                if (!savedProgress.pdocs.includes(`${pdoc.domainId}/${pdoc.docId}`) && pdoc.data instanceof ObjectID) {
                    try {
                        const [file, current] = await Promise.all([
                            streamToBuffer(gridfs.openDownloadStream(pdoc.data)),
                            storage.list(`problem/${pdoc.domainId}/${pdoc.docId}/testdata/`, true),
                        ]);
                        const zip = new AdmZip(file);
                        const entries = zip.getEntries();
                        if (entries.map((entry) => entry.entryName).sort().join('?') !== current.map((f) => f.name).sort().join('?')) {
                            await storage.del(current.map((entry) => entry.prefix + entry.name));
                            const queue = new Queue({ concurrency: 5 });
                            const tasks = [];
                            for (const entry of entries) {
                                tasks.push(queue.add(() => storage.put(
                                    `problem/${pdoc.domainId}/${pdoc.docId}/testdata/${entry.entryName}`,
                                    entry.getData(),
                                )));
                            }
                            await Promise.all(tasks);
                        }
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
        const userfileProgress = Progress.create({
            items: udocs.length, title: 'Users', y: 3,
        });
        for (const udoc of udocs) {
            userfileProgress.startItem(`${udoc._id}: ${udoc.uname}`);
            const ufdocs = await coll.find({ owner: udoc._id }).toArray();
            const currentUser = Progress.create({
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
        logger.success('Files copied successfully. You can now remove collection `file` `fs.files` `fs.chunks` in the database.');
        return true;
    },
    async function _4_5() {
        const _FRESH_INSTALL_IGNORE = 1;
        const domains = await domain.getMulti().project({ _id: 1 }).toArray();
        for (const d of domains) {
            const bulk = document.coll.initializeUnorderedBulkOp();
            const pdocs = await document.getMulti(d._id, document.TYPE_PROBLEM).project({ domainId: 1, docId: 1 }).toArray();
            for (const pdoc of pdocs) {
                const data = await storage.list(`problem/${pdoc.domainId}/${pdoc.docId}/testdata/`, true);
                bulk.find({ _id: pdoc._id }).updateOne({ $set: { data } });
            }
            if (bulk.length) await bulk.execute();
        }
        return true;
    },
    async function _5_6() {
        // Issue #58
        const _FRESH_INSTALL_IGNORE = 1;
        await domain.edit('system', { owner: 1 });
    },
];

export = scripts;
