/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-await-in-loop */
import { FilterQuery, ObjectID } from 'mongodb';
import AdmZip from 'adm-zip';
import Queue from 'p-queue';
import yaml from 'js-yaml';
import { pick } from 'lodash';
import { convertIniConfig } from '@hydrooj/utils/lib/cases';
import { Progress } from './ui';
import { Rdoc } from './interface';
import { Logger } from './logger';
import { streamToBuffer } from './utils';
import { iterateAllDomain, iterateAllProblem, iterateAllUser } from './pipelineUtils';
import gridfs from './service/gridfs';
import storage from './service/storage';
import db from './service/db';
import difficultyAlgorithm from './lib/difficulty';
import problem from './model/problem';
import user from './model/user';
import domain from './model/domain';
import * as document from './model/document';
import * as system from './model/system';
import { STATUS } from './model/builtin';

const logger = new Logger('upgrade');
type UpgradeScript = void | (() => Promise<boolean | void>);

const scripts: UpgradeScript[] = [
    // Mark as used
    null,
    // Init
    async function _1_2() {
        const ddoc = await domain.get('system');
        if (!ddoc) await domain.add('system', 1, 'Hydro', 'Hydro System');
        // TODO discussion node?
        return true;
    },
    // Add history column to ddoc,drdoc,psdoc
    async function _2_3() {
        const _FRESH_INSTALL_IGNORE = 1;
        await iterateAllDomain(async (d) => {
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
        });
        return true;
    },
    async function _3_4() {
        const _FRESH_INSTALL_IGNORE = 1;
        await db.collection('document').updateMany({ pid: /^\d+$/i }, { $unset: { pid: '' } });
        return true;
    },
    async function _4_5() {
        const _FRESH_INSTALL_IGNORE = 1;
        if (storage.error) {
            logger.error('Cannot upgrade. Please change storage config.');
            return false;
        }
        logger.info('Changing storage engine. This may take a long time.');
        // Problem file and User file
        let savedProgress = system.get('upgrade.file.progress.domain');
        if (savedProgress) savedProgress = JSON.parse(savedProgress);
        else savedProgress = { pdocs: [] };
        const ddocs = await domain.getMulti().project({ _id: 1 }).toArray();
        logger.info('Found %d domains.', ddocs.length);
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
                            storage.list(`problem/${pdoc.domainId}/${pdoc.docId}/testdata/`),
                        ]);
                        const zip = new AdmZip(file);
                        const entries = zip.getEntries();
                        if (entries.map((entry) => entry.entryName).sort().join('?') !== current.map((f) => f.name).sort().join('?')) {
                            await storage.del(current.map((entry) => entry.prefix + entry.name));
                            const queue = new Queue({ concurrency: 5 });
                            await Promise.all(entries.map(
                                (entry) => queue.add(() => problem.addTestdata(pdoc.domainId, pdoc.docId, entry.entryName, entry.getData())),
                            ));
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
        logger.success('Files copied successfully. You can now remove collection `file` `fs.files` `fs.chunks` in the database.');
        return true;
    },
    async function _5_6() {
        const _FRESH_INSTALL_IGNORE = 1;
        await iterateAllDomain(async (d) => {
            const bulk = document.coll.initializeUnorderedBulkOp();
            const pdocs = await document.getMulti(d._id, document.TYPE_PROBLEM).project({ domainId: 1, docId: 1 }).toArray();
            for (const pdoc of pdocs) {
                const data = await storage.list(`problem/${pdoc.domainId}/${pdoc.docId}/testdata/`, true);
                bulk.find({ _id: pdoc._id }).updateOne({ $set: { data } });
            }
            if (bulk.length) await bulk.execute();
        });
        return true;
    },
    async function _6_7() {
        // Issue #58
        const _FRESH_INSTALL_IGNORE = 1;
        await domain.edit('system', { owner: 1 });
        return true;
    },
    async function _7_8() {
        return true; // invalid
    },
    async function _8_9() {
        const _FRESH_INSTALL_IGNORE = 1;
        await iterateAllProblem(['docId', 'domainId', 'config'], async (pdoc) => {
            logger.info('%s/%s', pdoc.domainId, pdoc.docId);
            const [data, additional_file] = await Promise.all([
                storage.list(`problem/${pdoc.domainId}/${pdoc.docId}/testdata/`),
                storage.list(`problem/${pdoc.domainId}/${pdoc.docId}/additional_file/`),
            ]);
            await problem.edit(
                pdoc.domainId, pdoc.docId,
                { data: data.map((d) => ({ ...d, _id: d.name })), additional_file: additional_file.map((d) => ({ ...d, _id: d.name })) },
            );
            if (!pdoc.config) return;
            if (data.map((d) => d.name).includes('config.yaml')) return;
            const cfg = yaml.dump(pdoc.config);
            await problem.addTestdata(pdoc.domainId, pdoc.docId, 'config.yaml', Buffer.from(cfg));
        });
        return true;
    },
    async function _9_10() {
        const _FRESH_INSTALL_IGNORE = 1;
        await iterateAllProblem([], async (pdoc) => {
            logger.info('%s/%s', pdoc.domainId, pdoc.docId);
            const [data, additional_file] = await Promise.all([
                storage.list(`problem/${pdoc.domainId}/${pdoc.docId}/testdata/`),
                storage.list(`problem/${pdoc.domainId}/${pdoc.docId}/additional_file/`),
            ]) as any;
            for (let i = 0; i < data.length; i++) {
                data[i]._id = data[i].name;
            }
            for (let i = 0; i < additional_file.length; i++) {
                additional_file[i]._id = additional_file[i].name;
            }
            return { data, additional_file };
        });
        return true;
    },
    // Move category to tag
    async function _10_11() {
        const _FRESH_INSTALL_IGNORE = 1;
        await iterateAllProblem(['tag', 'category'], async (pdoc) => {
            await document.coll.updateOne(
                { domainId: pdoc.domainId, docId: pdoc.docId },
                {
                    $set: { tag: [...pdoc.tag || [], ...pdoc.category || []] },
                    $unset: { category: '' },
                },
            );
        });
        return true;
    },
    // Set null tag to []
    async function _11_12() {
        const _FRESH_INSTALL_IGNORE = 1;
        await db.collection('document').updateMany({ docType: 10, tag: null }, { $set: { tag: [] } });
        return true;
    },
    // Update problem difficulty
    async function _12_13() {
        const _FRESH_INSTALL_IGNORE = 1;
        await iterateAllProblem(['nSubmit', 'nAccept'], async (pdoc) => {
            const difficulty = difficultyAlgorithm(pdoc.nSubmit, pdoc.nAccept);
            await problem.edit(pdoc.domainId, pdoc.docId, { difficulty });
        });
        return true;
    },
    // Set domain owner perm
    async function _13_14() {
        const _FRESH_INSTALL_IGNORE = 1;
        await iterateAllDomain((ddoc) => domain.setUserRole(ddoc._id, ddoc.owner, 'root'));
        await db.collection('domain.user').updateMany({ role: 'admin' }, { $set: { role: 'root' } });
        return true;
    },
    async function _14_15() {
        const _FRESH_INSTALL_IGNORE = 1;
        await db.collection('domain.user').deleteMany({ uid: null });
        await db.collection('domain.user').deleteMany({ uid: 0 });
        return true;
    },
    async function _15_16() {
        const _FRESH_INSTALL_IGNORE = 1;
        await iterateAllProblem(['data', 'additional_file'], async (pdoc) => {
            const $set: any = {};
            const td = (pdoc.data || []).filter((f) => !!f.name);
            if (JSON.stringify(td) !== JSON.stringify(pdoc.data)) $set.data = td;
            const af = (pdoc.additional_file || []).filter((f) => !!f.name);
            if (JSON.stringify(af) !== JSON.stringify(pdoc.additional_file)) $set.additional_file = af;
            if (Object.keys($set).length) await problem.edit(pdoc.domainId, pdoc.docId, $set);
        });
        return true;
    },
    null,
    null,
    async function _18_19() {
        const _FRESH_INSTALL_IGNORE = 1;
        await iterateAllProblem(['content'], async (pdoc) => {
            if (typeof pdoc.content !== 'string') {
                await problem.edit(pdoc.domainId, pdoc.docId, { content: JSON.stringify(pdoc.content) });
            }
        });
        return true;
    },
    async function _19_20() {
        const data = db.collection('record').aggregate([
            { $match: { hidden: false, type: { $ne: 'run' } } },
            {
                $group: {
                    _id: { domainId: '$domainId', pid: '$pid', uid: '$uid' },
                    nAccept: {
                        $sum: {
                            $cond: [{ $eq: ['$status', STATUS.STATUS_ACCEPTED] }, 1, 0],
                        },
                    },
                },
            },
        ]);
        while (await data.hasNext()) {
            const d: any = await data.next();
            logger.info('%o', d);
            const filter: FilterQuery<Rdoc> = { domainId: d._id.domainId, pid: d._id.pid, uid: d._id.uid };
            if (d.nAccept) {
                const [first] = await db.collection('record')
                    .find({ ...filter, status: STATUS.STATUS_ACCEPTED })
                    .sort({ _id: 1 }).limit(1)
                    .project({ _id: 1 })
                    .toArray();
                filter._id = { $lte: first._id };
            }
            await db.collection('record').updateMany(filter, { $set: { effective: true } });
        }
        return true;
    },
    async function _20_21() {
        await iterateAllProblem([], async (pdoc) => {
            let config: string;
            try {
                const file = await storage.get(`problem/${pdoc.domainId}/${pdoc.docId}/testdata/config.yaml`);
                config = (await streamToBuffer(file)).toString('utf-8');
                logger.info(`Loaded config for ${pdoc.domainId}/${pdoc.docId} from config.yaml`);
            } catch (e) {
                try {
                    const file = await storage.get(`problem/${pdoc.domainId}/${pdoc.docId}/testdata/config.yml`);
                    config = (await streamToBuffer(file)).toString('utf-8');
                    logger.info(`Loaded config for ${pdoc.domainId}/${pdoc.docId} from config.yml`);
                } catch (err) {
                    try {
                        const file = await storage.get(`problem/${pdoc.domainId}/${pdoc.docId}/testdata/config.ini`);
                        config = yaml.dump(convertIniConfig((await streamToBuffer(file)).toString('utf-8')));
                        logger.info(`Loaded config for ${pdoc.domainId}/${pdoc.docId} from config.ini`);
                    } catch (error) {
                        logger.warn('Config for %s/%s(%s) not found', pdoc.domainId, pdoc.docId, pdoc.pid || pdoc.docId);
                        // no config found
                    }
                }
            }
            if (config) await problem.edit(pdoc.domainId, pdoc.docId, { config });
        });
        return true;
    },
    async function _21_22() {
        const coll = db.collection('domain');
        await iterateAllDomain(async (ddoc) => {
            if (ddoc.join) {
                await coll.updateOne(pick(ddoc, '_id'), { $set: { _join: ddoc.join }, $unset: { join: '' } });
            }
        });
        return true;
    },
    async function _22_23() {
        await iterateAllUser(async (udoc) => {
            if (!udoc.gravatar) return;
            await user.setById(udoc._id, { avatar: `gravatar:${udoc.gravatar}` }, { gravatar: '' });
        });
        return true;
    },
];

export default scripts;
