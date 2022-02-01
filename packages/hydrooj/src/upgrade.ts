/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-await-in-loop */
/* eslint-disable @typescript-eslint/naming-convention */
import AdmZip from 'adm-zip';
import yaml from 'js-yaml';
import { pick } from 'lodash';
import { BucketItem } from 'minio';
import moment from 'moment';
import { GridFSBucket, ObjectID } from 'mongodb';
import Queue from 'p-queue';
import { convertIniConfig } from '@hydrooj/utils/lib/cases';
import { buildContent } from './lib/content';
import { size } from './lib/misc';
import { Logger } from './logger';
import { PRIV, STATUS } from './model/builtin';
import * as contest from './model/contest';
import * as discussion from './model/discussion';
import * as document from './model/document';
import domain from './model/domain';
import problem from './model/problem';
import RecordModel from './model/record';
import StorageModel from './model/storage';
import * as system from './model/system';
import TaskModel from './model/task';
import user from './model/user';
import {
    iterateAllDomain, iterateAllProblem, iterateAllPsdoc, iterateAllUser,
} from './pipelineUtils';
import db from './service/db';
import storage from './service/storage';
import { Progress } from './ui';
import { streamToBuffer } from './utils';

const logger = new Logger('upgrade');
type UpgradeScript = void | (() => Promise<boolean | void>);

const scripts: UpgradeScript[] = [
    // Mark as used
    null,
    // Init
    async function _1_2() {
        const ddoc = await domain.get('system');
        if (!ddoc) await domain.add('system', 1, 'Hydro', 'Welcome to Hydro!');
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
        const gridfs = new GridFSBucket(db.db2);
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
    null,
    async function _20_21() {
        const _FRESH_INSTALL_IGNORE = 1;
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
        const _FRESH_INSTALL_IGNORE = 1;
        const coll = db.collection('domain');
        await iterateAllDomain(async (ddoc) => {
            if (ddoc.join) {
                await coll.updateOne(pick(ddoc, '_id'), { $set: { _join: ddoc.join }, $unset: { join: '' } });
            }
        });
        return true;
    },
    async function _22_23() {
        const _FRESH_INSTALL_IGNORE = 1;
        await iterateAllUser(async (udoc) => {
            if (!udoc.gravatar) return;
            await user.setById(udoc._id, { avatar: `gravatar:${udoc.gravatar}` }, { gravatar: '' });
        });
        return true;
    },
    async function _23_24() {
        const _FRESH_INSTALL_IGNORE = 1;
        await db.collection('oplog').updateMany({}, { $set: { type: 'delete', operateIp: '127.0.0.1' } });
        return true;
    },
    async function _24_25() {
        const _FRESH_INSTALL_IGNORE = 1;
        await iterateAllDomain(async (ddoc) => {
            if (typeof ddoc.host === 'string') await domain.edit(ddoc._id, { host: [ddoc.host] });
        });
        return true;
    },
    async function _25_26() {
        const _FRESH_INSTALL_IGNORE = 1;
        await iterateAllPsdoc({ rid: { $exists: true } }, async (psdoc) => {
            const rdoc = await RecordModel.get(psdoc.domainId, psdoc.rid);
            await document.setStatus(psdoc.domainId, document.TYPE_PROBLEM, rdoc.pid, rdoc.uid, { score: rdoc.score });
        });
        return true;
    },
    async function _26_27() {
        const _FRESH_INSTALL_IGNORE = 1;
        const stream = storage.client.listObjects(storage.opts.bucket, '', true);
        await new Promise<BucketItem[]>((resolve, reject) => {
            stream.on('data', (result) => {
                if (result.size) {
                    logger.debug('File found: %s %s', result.name, size(result.size));
                    StorageModel.coll.insertOne({
                        _id: result.name,
                        path: result.name,
                        size: result.size,
                        lastModified: result.lastModified,
                        lastUsage: new Date(),
                        etag: result.etag,
                        meta: {},
                    });
                }
            });
            stream.on('end', () => resolve(null));
            stream.on('error', reject);
        });
        return true;
    },
    async function _27_28() {
        const _FRESH_INSTALL_IGNORE = 1;
        const cursor = document.coll.find({ docType: document.TYPE_DISCUSSION });
        while (await cursor.hasNext()) {
            const data = await cursor.next();
            const t = Math.exp(-0.15 * (((new Date().getTime() / 1000) - data._id.generationTime) / 3600));
            const rCount = await discussion.getMultiReply(data.domainId, data.docId).count();
            const sort = ((data.sort || 100) + Math.max(rCount - (data.lastRCount || 0), 0) * 10) * t;
            await document.coll.updateOne({ _id: data._id }, { $set: { sort, lastRCount: rCount } });
        }
        return true;
    },
    async function _28_29() {
        const _FRESH_INSTALL_IGNORE = 1;
        await iterateAllProblem(['content', 'html'], async (pdoc) => {
            try {
                const parsed = JSON.parse(pdoc.content);
                if (parsed instanceof Array) {
                    await problem.edit(pdoc.domainId, pdoc.docId, { content: buildContent(parsed, pdoc.html ? 'html' : 'markdown') });
                    return;
                }
                const res = {};
                for (const key in parsed) {
                    if (typeof parsed[key] === 'string') res[key] = parsed[key];
                    else res[key] = buildContent(parsed[key]);
                }
                await problem.edit(pdoc.domainId, pdoc.docId, { content: JSON.stringify(res) });
            } catch { }
        });
        return true;
    },
    async function _29_30() {
        const _FRESH_INSTALL_IGNORE = 1;
        await iterateAllDomain((ddoc) => RecordModel.coll.updateMany({ domainId: ddoc._id }, { $set: { pdomain: ddoc._id } }));
        return true;
    },
    // Add send_message priv to user
    async function _30_31() {
        const _FRESH_INSTALL_IGNORE = 1;
        await iterateAllUser((udoc) => user.setPriv(udoc._id, udoc.priv | PRIV.PRIV_SEND_MESSAGE));
        return true;
    },
    null,
    // Write builtin users to database
    async function _32_33() {
        if (!await user.getById('system', 0)) {
            await user.create('Guest@hydro.local', 'Guest', String.random(32), 0, '127.0.0.1', PRIV.PRIV_REGISTER_USER);
        }
        if (!await user.getById('system', 1)) {
            await user.create('Hydro@hydro.local', 'Hydro', String.random(32), 1, '127.0.0.1', PRIV.PRIV_USER_PROFILE);
        }
        return true;
    },
    async function _33_34() {
        const _FRESH_INSTALL_IGNORE = 1;
        await iterateAllProblem(['content'], async (pdoc) => {
            if (typeof pdoc.content !== 'string') return;
            await problem.edit(pdoc.domainId, pdoc.docId, { content: pdoc.content.replace(/%file%:\/\//g, 'file://') });
        });
        return true;
    },
    async function _34_35() {
        const _FRESH_INSTALL_IGNORE = 1;
        await iterateAllDomain((ddoc) => domain.edit(ddoc._id, { lower: ddoc._id.toLowerCase() }));
        return true;
    },
    async function _35_36() {
        const _FRESH_INSTALL_IGNORE = 1;
        await RecordModel.coll.updateMany({}, { $unset: { effective: '' } });
        return true;
    },
    async function _36_37() {
        const _FRESH_INSTALL_IGNORE = 1;
        const cur = document.collStatus.find();
        while (await cur.hasNext()) {
            const doc = await cur.next();
            await document.collStatus.deleteMany({
                ...pick(doc, ['docId', 'domainId', 'uid', 'docType']),
                _id: { $gt: doc._id },
            });
        }
        return true;
    },
    async function _37_38() {
        const _FRESH_INSTALL_IGNORE = 1;
        await iterateAllProblem(['docId', 'domainId', 'config'], async (pdoc) => {
            logger.info('%s/%s', pdoc.domainId, pdoc.docId);
            if (typeof pdoc.config !== 'string') return;
            if (!pdoc.config.includes('type: subjective')) return;
            await problem.addTestdata(
                pdoc.domainId, pdoc.docId, 'config.yaml',
                Buffer.from(pdoc.config.replace('type: subjective', 'type: objective')),
            );
        });
        return true;
    },
    async function _38_39() {
        const _FRESH_INSTALL_IGNORE = 1;
        await iterateAllDomain(async (ddoc) => {
            ddoc.roles.root = '-1';
            await domain.setRoles(ddoc._id, ddoc.roles);
        });
        return true;
    },
    async function _39_40() {
        const _FRESH_INSTALL_IGNORE = 1;
        await iterateAllDomain(async ({ _id }) => {
            const ddocs = await discussion.getMulti(_id, { parentType: document.TYPE_PROBLEM }).toArray();
            for (const ddoc of ddocs) {
                const pdoc = await problem.get(_id, ddoc.parentId as any);
                await document.set(_id, document.TYPE_DISCUSSION, ddoc.docId, { parentId: pdoc.docId });
            }
        });
        return true;
    },
    async function _40_41() {
        const _FRESH_INSTALL_IGNORE = 1;
        // Ignore drop index failure
        await db.collection('storage').dropIndex('path_1').catch(() => { });
        await db.collection('storage').updateMany(
            { autoDelete: { $gte: moment().add(5, 'days').toDate() } },
            { $unset: { autoDelete: '' } },
        );
        return true;
    },
    async function _41_42() {
        const _FRESH_INSTALL_IGNORE = 1;
        await iterateAllDomain(async (ddoc) => {
            const cursor = discussion.getMulti(ddoc._id, { parentType: document.TYPE_CONTEST });
            while (await cursor.hasNext()) {
                const doc = await cursor.next();
                const tdoc = await document.coll.findOne({ docType: doc.parentType, docId: doc.parentId });
                if (!tdoc) await discussion.del(ddoc._id, doc.docId);
            }
        });
        return true;
    },
    async function _42_43() {
        const _FRESH_INSTALL_IGNORE = 1;
        const processer = (i) => {
            i.status = i.accept ? STATUS.STATUS_ACCEPTED : STATUS.STATUS_WRONG_ANSWER;
            return i;
        };
        await iterateAllDomain(async (ddoc) => {
            const tdocs = await contest.getMulti(ddoc._id, { rule: 'acm' }).toArray();
            for (const tdoc of tdocs) {
                const tsdocs = await contest.getMultiStatus(ddoc._id, { docId: tdoc.docId }).toArray();
                for (const tsdoc of tsdocs) {
                    const $set: any = {};
                    if (tsdoc.journal?.length) $set.journal = tsdoc.journal.map(processer);
                    if (tsdoc.detail?.length) $set.detail = tsdoc.detail.map(processer);
                    if (Object.keys($set).length) {
                        await contest.setStatus(ddoc._id, tdoc.docId, tsdoc.uid, $set);
                    }
                }
            }
        });
        return true;
    },
    async function _43_44() {
        const _FRESH_INSTALL_IGNORE = 1;
        const processer = (i) => {
            i.status = i.accept ? STATUS.STATUS_ACCEPTED : STATUS.STATUS_WRONG_ANSWER;
            return i;
        };
        await iterateAllDomain(async (ddoc) => {
            const tdocs = await contest.getMulti(ddoc._id, { rule: { $ne: 'acm' } }).toArray();
            for (const tdoc of tdocs) {
                const tsdocs = await contest.getMultiStatus(ddoc._id, { docId: tdoc.docId }).toArray();
                for (const tsdoc of tsdocs) {
                    const $set: any = {};
                    if (tsdoc.journal?.length) $set.journal = tsdoc.journal.map(processer);
                    if (tsdoc.detail?.length) $set.detail = tsdoc.detail.map(processer);
                    if (Object.keys($set).length) {
                        await contest.setStatus(ddoc._id, tdoc.docId, tsdoc.uid, $set);
                    }
                }
            }
        });
        return true;
    },
    async function _44_45() {
        const _FRESH_INSTALL_IGNORE = 1;
        await iterateAllUser((udoc) => user.setById(udoc._id, { ip: [udoc.regip] }, { regip: '' }));
        return true;
    },
    async function _45_46() {
        const _FRESH_INSTALL_IGNORE = 1;
        await iterateAllDomain(async (ddoc) => {
            const ddocs = await discussion.getMulti(ddoc._id, {
                docType: document.TYPE_DISCUSSION,
                parentType: { $in: [document.TYPE_CONTEST, 60, document.TYPE_TRAINING] },
                parentId: { $type: 'string' },
            }).toArray();
            for (const doc of ddocs) {
                if (ObjectID.isValid(doc.parentId)) {
                    await document.set(ddoc._id, document.TYPE_DISCUSSION, doc.docId, { parentId: new ObjectID(doc.parentId) });
                }
            }
        });
        return true;
    },
    null,
    async function _47_48() {
        const _FRESH_INSTALL_IGNORE = 1;
        await document.coll.updateMany({ docType: document.TYPE_HOMEWORK }, { $set: { docType: document.TYPE_CONTEST } });
        await document.collStatus.updateMany({ docType: document.TYPE_HOMEWORK }, { $set: { docType: document.TYPE_CONTEST } });
        await RecordModel.coll.deleteMany({ 'contest.tid': { $ne: null }, hidden: true });
        await RecordModel.coll.updateMany({}, { $unset: { hidden: '' } });
        await RecordModel.coll.updateMany({ 'contest.tid': { $exists: true } }, { $rename: { 'contest.tid': 'contest1' } });
        await RecordModel.coll.updateMany({ contest1: { $exists: true } }, { $rename: { contest1: 'contest' } });
        await RecordModel.coll.updateMany({ contest: null }, { $unset: { contest: '' } });
        return true;
    },
    async function _48_49() {
        const _FRESH_INSTALL_IGNORE = 1;
        await RecordModel.coll.updateMany({ input: { $exists: true } }, { $set: { contest: new ObjectID('000000000000000000000000') } });
        return true;
    },
    async function _49_50() {
        const _FRESH_INSTALL_IGNORE = 1;
        await db.collection('user').updateMany({}, { $unset: { ratingHistory: '' } });
        await db.collection('domain').updateMany({}, { $unset: { pidCounter: '' } });
        return true;
    },
    async function _50_51() {
        const _FRESH_INSTALL_IGNORE = 1;
        await db.collection('domain.user').updateMany({}, { $unset: { ratingHistory: '' } });
        return true;
    },
    async function _51_52() {
        const _FRESH_INSTALL_IGNORE = 1;
        const mapping: Record<string, number> = {};
        const isStringPid = (i: string) => i.toString().includes(':');
        async function getProblem(domainId: string, target: string) {
            if (!target.toString().includes(':')) return await problem.get(domainId, target);
            const l = `${domainId}/${target}`;
            if (mapping[l]) return await problem.get(domainId, mapping[l]);
            const [sourceDomain, sourceProblem] = target.split(':');
            const docId = await problem.copy(sourceDomain, +sourceProblem, domainId);
            mapping[l] = docId;
            return await problem.get(domainId, docId);
        }
        const cursor = db.collection('document').find({ docType: document.TYPE_CONTEST });
        while (await cursor.hasNext()) {
            const doc = await cursor.next();
            const pids = [];
            let mark = false;
            for (const pid of doc.pids) {
                if (pid.toString().includes(':')) {
                    mark = true;
                    const pdoc = await getProblem(doc.domainId, pid);
                    if (pdoc) {
                        pids.push(pdoc.docId);
                        await RecordModel.updateMulti(
                            doc.domainId,
                            { contest: doc.docId, pid },
                            { pid: pdoc.docId },
                            {},
                            { pdomain: '' },
                        );
                    }
                } else pids.push(pid);
            }
            if (mark) {
                const ctdocs = await document.getMultiStatus(
                    doc.domainId, document.TYPE_CONTEST, { docId: doc.docId },
                ).toArray();
                for (const ctdoc of ctdocs) {
                    if (!ctdoc.journal?.filter((i) => isStringPid(i.pid)).length) continue;
                    const journal = [];
                    for (const i of ctdoc.journal) {
                        const pdoc = await getProblem(doc.domainId, i.pid);
                        if (pdoc) i.pid = pdoc.docId;
                        journal.push(i);
                    }
                    const $set = { journal };
                    await document.setStatus(doc.domainId, doc.docType, doc.docId, ctdoc.uid, $set);
                }
                await contest.edit(doc.domainId, doc.docId, { pids });
                await contest.recalcStatus(doc.domainId, doc.docId);
            }
        }
        await db.collection('record').updateMany({}, { $unset: { pdomain: '' } });
        return true;
    },
    async function _52_53() {
        const _FRESH_INSTALL_IGNORE = 1;
        const cursor = db.collection('document').find({ docType: document.TYPE_CONTEST });
        while (await cursor.hasNext()) {
            const tdoc = await cursor.next();
            const pdocs = await problem.getMulti(tdoc.domainId, { docId: { $in: tdoc.pids } }).toArray();
            if (!pdocs.filter((i) => i.reference).length) continue;
            const tsdocs = await contest.getMultiStatus(tdoc.domainId, { docId: tdoc.docId }).toArray();
            for (const tsdoc of tsdocs) {
                for (const tsrdoc of tsdoc.journal) {
                    await RecordModel.coll.updateOne({ _id: tsrdoc.rid }, { pid: tsrdoc.pid });
                }
            }
        }
        return true;
    },
    async function _53_54() {
        const _FRESH_INSTALL_IGNORE = 1;
        let ddocs = await db.collection('document').find({ docType: 21, parentType: 10 })
            .project({ _id: 1, parentId: 1 }).toArray();
        ddocs = ddocs.filter((i) => Number.isSafeInteger(+i.parentId));
        if (ddocs.length) {
            const bulk = db.collection('document').initializeUnorderedBulkOp();
            for (const ddoc of ddocs) {
                bulk.find({ _id: ddoc._id }).updateOne({ $set: { parentId: +ddoc.parentId } });
            }
            await bulk.execute();
        }
        return true;
    },
    async function _54_55() {
        const _FRESH_INSTALL_IGNORE = 1;
        const bulk = db.collection('document').initializeUnorderedBulkOp();
        function sortable(source: string) {
            return source.replace(/(\d+)/g, (str) => (str.length >= 6 ? str : ('0'.repeat(6 - str.length) + str)));
        }
        await iterateAllProblem(['pid', '_id'], async (pdoc) => {
            bulk.find({ _id: pdoc._id }).updateOne({ $set: { sort: sortable(pdoc.pid || `P${pdoc.docId}`) } });
        });
        if (bulk.length) await bulk.execute();
        return true;
    },
    async function _55_56() {
        const _FRESH_INSTALL_IGNORE = 1;
        await db.collection('document').updateMany({ docType: document.TYPE_PROBLEM }, { $unset: { difficulty: '' } });
        return true;
    },
    async function _56_57() {
        const _FRESH_INSTALL_IGNORE = 1;
        await db.collection('oplog').deleteMany({ type: 'user.login' });
        return true;
    },
    async function _57_58() {
        const _FRESH_INSTALL_IGNORE = 1;
        await db.collection('document').updateMany(
            { docType: document.TYPE_PROBLEM, assign: null },
            { $set: { assign: [] } },
        );
        return true;
    },
    async function _58_59() {
        const _FRESH_INSTALL_IGNORE = 1;
        const tasks = await db.collection('task').find({ type: 'schedule', subType: 'contest.problemHide' }).toArray();
        for (const task of tasks) {
            await TaskModel.add({ ...task, subType: 'contest', operation: ['unhide'] });
        }
        await TaskModel.deleteMany({ type: 'schedule', subType: 'contest.problemHide' });
        return true;
    },
];

export default scripts;
