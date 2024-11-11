/* eslint-disable consistent-return */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-await-in-loop */
/* eslint-disable @typescript-eslint/naming-convention */
import yaml from 'js-yaml';
import { pick } from 'lodash';
import moment from 'moment-timezone';
import { ObjectId } from 'mongodb';
import { sleep } from '@hydrooj/utils';
import { buildContent } from './lib/content';
import { Logger } from './logger';
import { PERM, PRIV, STATUS } from './model/builtin';
import * as contest from './model/contest';
import * as discussion from './model/discussion';
import * as document from './model/document';
import domain from './model/domain';
import MessageModel from './model/message';
import problem from './model/problem';
import RecordModel from './model/record';
import ScheduleModel from './model/schedule';
import StorageModel from './model/storage';
import * as system from './model/system';
import TaskModel from './model/task';
import * as training from './model/training';
import user, { handleMailLower } from './model/user';
import {
    iterateAllContest, iterateAllDomain, iterateAllProblem, iterateAllUser,
} from './pipelineUtils';
import db from './service/db';
import { MigrationScript } from './service/migration';
import { setBuiltinConfig } from './settings';
import welcome from './welcome';

const logger = new Logger('upgrade');
const unsupportedUpgrade = async function _26_27() {
    throw new Error('This upgrade was no longer supported in hydrooj@4. \
Please use hydrooj@3 to perform these upgrades before upgrading to v4');
};

export const coreScripts: MigrationScript[] = [
    // Mark as used
    async function init() {
        if (!await user.getById('system', 0)) {
            await user.create('Guest@hydro.local', 'Guest', String.random(32), 0, '127.0.0.1', PRIV.PRIV_REGISTER_USER);
        }
        if (!await user.getById('system', 1)) {
            await user.create('Hydro@hydro.local', 'Hydro', String.random(32), 1, '127.0.0.1', PRIV.PRIV_USER_PROFILE);
        }
        const ddoc = await domain.get('system');
        if (!ddoc) await domain.add('system', 1, 'Hydro', 'Welcome to Hydro!');
        await welcome();
        return true;
    },
    // Init
    ...new Array(28).fill(unsupportedUpgrade),
    async function _29_30() {
        return await iterateAllDomain((ddoc) => RecordModel.coll.updateMany({ domainId: ddoc._id }, { $set: { pdomain: ddoc._id } }));
    },
    // Add send_message priv to user
    async function _30_31() {
        return await iterateAllUser((udoc) => user.setPriv(udoc._id, udoc.priv | PRIV.PRIV_SEND_MESSAGE));
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
        return await iterateAllProblem(['content'], async (pdoc) => {
            if (typeof pdoc.content !== 'string') return;
            await problem.edit(pdoc.domainId, pdoc.docId, { content: pdoc.content.replace(/%file%:\/\//g, 'file://') });
        });
    },
    async function _34_35() {
        return await iterateAllDomain((ddoc) => domain.edit(ddoc._id, { lower: ddoc._id.toLowerCase() }));
    },
    async function _35_36() {
        await RecordModel.coll.updateMany({}, { $unset: { effective: '' } });
        return true;
    },
    async function _36_37() {
        for await (const doc of document.collStatus.find()) {
            await document.collStatus.deleteMany({
                ...pick(doc, ['docId', 'domainId', 'uid', 'docType']),
                _id: { $gt: doc._id },
            });
        }
        return true;
    },
    async function _37_38() {
        return await iterateAllProblem(['docId', 'domainId', 'config'], async (pdoc) => {
            logger.info('%s/%s', pdoc.domainId, pdoc.docId);
            if (typeof pdoc.config !== 'string') return;
            if (!pdoc.config.includes('type: subjective')) return;
            await problem.addTestdata(
                pdoc.domainId, pdoc.docId, 'config.yaml',
                Buffer.from(pdoc.config.replace('type: subjective', 'type: objective')),
            );
        });
    },
    async function _38_39() {
        return await iterateAllDomain(async (ddoc) => {
            ddoc.roles.root = '-1';
            await domain.setRoles(ddoc._id, ddoc.roles);
        });
    },
    async function _39_40() {
        return await iterateAllDomain(async ({ _id }) => {
            const ddocs = await discussion.getMulti(_id, { parentType: document.TYPE_PROBLEM }).toArray();
            for (const ddoc of ddocs) {
                const pdoc = await problem.get(_id, ddoc.parentId as any);
                await document.set(_id, document.TYPE_DISCUSSION, ddoc.docId, { parentId: pdoc.docId });
            }
        });
    },
    async function _40_41() {
        // Ignore drop index failure
        await db.collection('storage').dropIndex('path_1').catch(() => { });
        await db.collection('storage').updateMany(
            { autoDelete: { $gte: moment().add(5, 'days').toDate() } },
            { $unset: { autoDelete: '' } },
        );
        return true;
    },
    async function _41_42() {
        return await iterateAllDomain(async (ddoc) => {
            const cursor = discussion.getMulti(ddoc._id, { parentType: document.TYPE_CONTEST });
            while (await cursor.hasNext()) {
                const doc = await cursor.next();
                const tdoc = await document.coll.findOne({ docType: doc.parentType, docId: doc.parentId });
                if (!tdoc) await discussion.del(ddoc._id, doc.docId);
            }
        });
    },
    null,
    async function _43_44() {
        const processer = (i) => {
            i.status = i.accept ? STATUS.STATUS_ACCEPTED : STATUS.STATUS_WRONG_ANSWER;
            return i;
        };
        return await iterateAllDomain(async (ddoc) => {
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
    },
    async function _44_45() {
        return await iterateAllUser((udoc) => user.setById(udoc._id, { ip: [udoc.regip] }, { regip: '' }));
    },
    async function _45_46() {
        return await iterateAllDomain(async (ddoc) => {
            const ddocs = await discussion.getMulti(ddoc._id, {
                docType: document.TYPE_DISCUSSION,
                parentType: { $in: [document.TYPE_CONTEST, 60, document.TYPE_TRAINING] },
                parentId: { $type: 'string' },
            }).toArray();
            for (const doc of ddocs) {
                if (ObjectId.isValid(doc.parentId)) {
                    await document.set(ddoc._id, document.TYPE_DISCUSSION, doc.docId, { parentId: new ObjectId(doc.parentId) });
                }
            }
        });
    },
    null,
    async function _47_48() {
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
        await RecordModel.coll.updateMany({ input: { $exists: true } }, { $set: { contest: new ObjectId('000000000000000000000000') } });
        return true;
    },
    async function _49_50() {
        await db.collection('user').updateMany({}, { $unset: { ratingHistory: '' } });
        await db.collection('domain').updateMany({}, { $unset: { pidCounter: '' } });
        return true;
    },
    async function _50_51() {
        await db.collection('domain.user').updateMany({}, { $unset: { ratingHistory: '' } });
        return true;
    },
    async function _51_52() {
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
        for await (const doc of cursor) {
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
        const cursor = db.collection('document').find({ docType: document.TYPE_CONTEST });
        for await (const tdoc of cursor) {
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
        const bulk = db.collection('document').initializeUnorderedBulkOp();
        function sortable(source: string) {
            return source.replace(/(\d+)/g, (str) => (str.length >= 6 ? str : ('0'.repeat(6 - str.length) + str)));
        }
        await iterateAllProblem(['pid', '_id'], async (pdoc) => {
            bulk.find({ _id: pdoc._id }).updateOne({ $set: { sort: sortable(pdoc.pid || `P${pdoc.docId}`) } });
        });
        if (bulk.batches.length) await bulk.execute();
        return true;
    },
    async function _55_56() {
        await db.collection('document').updateMany({ docType: document.TYPE_PROBLEM }, { $unset: { difficulty: '' } });
        return true;
    },
    async function _56_57() {
        await db.collection('oplog').deleteMany({ type: 'user.login' });
        return true;
    },
    null,
    async function _58_59() {
        const tasks = await db.collection('task').find({ type: 'schedule', subType: 'contest.problemHide' }).toArray();
        for (const task of tasks) {
            await ScheduleModel.add({ ...task, subType: 'contest', operation: ['unhide'] });
        }
        await TaskModel.deleteMany({ type: 'schedule', subType: 'contest.problemHide' });
        return true;
    },
    async function _59_60() {
        const langs = system.get('hydrooj.langs');
        await system.set('hydrooj.langs', langs.replace(/\$\{dir\}/g, '/w').replace(/\$\{name\}/g, 'foo'));
        return true;
    },
    async function _60_61() {
        const config = await system.get('hydrooj.homepage');
        const data = yaml.load(config) as any;
        if (!(data instanceof Array)) {
            await system.set('hydrooj.homepage', yaml.dump([
                { width: 9, bulletin: true, ...data },
                {
                    width: 3, hitokoto: true, starred_problems: 50, discussion_nodes: true, suggestion: true,
                },
            ]));
        }
        return true;
    },
    async function _61_62() {
        const priv = +system.get('default.priv');
        if (priv & PRIV.PRIV_REGISTER_USER) {
            const udocs = await user.getMulti({ priv }).project({ _id: 1 }).toArray();
            for (const udoc of udocs) {
                await user.setById(udoc._id, { priv: priv - PRIV.PRIV_REGISTER_USER });
            }
            await system.set('default.priv', priv - PRIV.PRIV_REGISTER_USER);
        }
        return true;
    },
    async function _62_63() {
        const uids = new Set<number>();
        await iterateAllDomain(async (ddoc) => {
            const pdocs = await problem.getMulti(ddoc._id, { config: /type: objective/ })
                .project({
                    config: 1, content: 1, docId: 1, owner: 1,
                }).toArray();
            for (const pdoc of pdocs) {
                try {
                    const config = yaml.load(pdoc.config as string) as any;
                    if (config.type !== 'objective' || !config.outputs) continue;
                    config.answers = {};
                    let cnt = 0;
                    for (const l of config.outputs) {
                        cnt++;
                        config.answers[cnt] = l;
                    }

                    function processSingleLanguage(content: string) { // eslint-disable-line no-inner-declarations
                        let text = '';
                        try {
                            let scnt = 0;
                            const doc = yaml.load(content);
                            if (!(doc instanceof Array)) return content;
                            for (const s of doc) {
                                scnt++;
                                text += `${scnt}. ${s.desc}\n`;
                                if (s.choices) {
                                    text += `{{ select(${scnt}) }}\n`;
                                    const isPrefixed = s.choices.every((c) => /^[A-Z]\./.test(c));
                                    let selectionId = 64;
                                    for (const c of s.choices) {
                                        selectionId++;
                                        text += `- ${isPrefixed ? c.replace(/^[A-Z]\./, '') : c}\n`;
                                        if (config.answers[scnt][0] === c) config.answers[scnt][0] = String.fromCharCode(selectionId);
                                    }
                                } else text += `{{ input(${scnt}) }}\n`;
                                text += '\n';
                            }
                        } catch (e) { console.error(e); return content; }
                        return text;
                    }

                    try {
                        const langs = JSON.parse(pdoc.content);
                        if (typeof langs === 'object' && !(langs instanceof Array)) {
                            for (const lang in langs) {
                                if (typeof langs[lang] !== 'string') continue;
                                langs[lang] = processSingleLanguage(langs[lang]);
                            }
                            await problem.edit(ddoc._id, pdoc.docId, { content: JSON.stringify(langs) });
                        }
                    } catch (e) {
                        const content = processSingleLanguage(pdoc.content);
                        await problem.edit(ddoc._id, pdoc.docId, { content });
                    }
                    uids.add(pdoc.owner);
                    delete config.outputs;
                    await problem.addTestdata(ddoc._id, pdoc.docId, 'config.yaml', Buffer.from(yaml.dump(config)));
                } catch (e) { console.error(e); }
            }
        });
        for (const uid of uids) {
            await MessageModel.send(1, uid, '我们更新了客观题的配置格式，已有题目已自动转换，查看文档获得更多信息。', MessageModel.FLAG_UNREAD);
        }
        return true;
    },
    async function _63_64() {
        await db.collection('document').updateMany(
            { rule: 'homework', penaltySince: { $exists: false } },
            { $set: { penaltySince: new Date() } },
        );
        return true;
    },
    null,
    null,
    async function _66_67() {
        const [
            endPoint, accessKey, secretKey, bucket, region,
            pathStyle, endPointForUser, endPointForJudge,
        ] = system.getMany([
            'file.endPoint', 'file.accessKey', 'file.secretKey', 'file.bucket', 'file.region',
            'file.pathStyle', 'file.endPointForUser', 'file.endPointForJudge',
        ] as any[]) as any;
        if ((endPoint && accessKey) || process.env.MINIO_ACCESS_KEY) {
            await setBuiltinConfig('file', {
                type: 's3',
                endPoint: process.env.MINIO_ACCESS_KEY ? 'http://127.0.0.1:9000/' : endPoint,
                accessKey: process.env.MINIO_ACCESS_KEY || accessKey,
                secretKey: process.env.MINIO_SECRET_KEY || secretKey,
                bucket,
                region,
                pathStyle,
                endPointForUser,
                endPointForJudge,
            });
            await system.set('db.ver', 67);
            await sleep(1000);
            logger.info('Upgrade done. please restart the server.');
            process.exit(0);
        }
        return true;
    },
    async function _67_68() {
        const rdocs = RecordModel.coll.find({ code: /^@@hydro_submission_file@@/ });
        for await (const rdoc of rdocs) {
            await RecordModel.update(rdoc.domainId, rdoc._id, {
                files: { code: rdoc.code.split('@@hydro_submission_file@@')[1] },
                code: '',
            });
        }
        return true;
    },
    async function _68_69() {
        await db.collection('cache' as any).deleteMany({});
        return true;
    },
    async function _69_70() {
        const tasks = await TaskModel.coll.find({ type: 'schedule', subType: 'contest' }).toArray();
        if (tasks.length) await ScheduleModel.coll.insertMany(tasks as any);
        await TaskModel.coll.deleteMany({});
        return true;
    },
    null,
    async function _71_72() {
        return await iterateAllContest(async (tdoc) => {
            if (['acm', 'homework'].includes(tdoc.rule)) {
                await contest.recalcStatus(tdoc.domainId, tdoc.docId);
            }
        });
    },
    async function _72_73() {
        await db.collection('oplog').updateMany({}, { $unset: { 'args.verifyPassword': '' } });
        return true;
    },
    async function _73_74() {
        await db.collection('document').updateMany({ docType: document.TYPE_DISCUSSION }, { $unset: { sort: '' } });
        await ScheduleModel.deleteMany({ subType: 'discussion.sort' });
        return true;
    },
    async function _74_75() {
        const list = {
            READ_PRETEST_DATA: 1 << 5,
            READ_PRETEST_DATA_SELF: 1 << 6,
            DELETE_FILE_SELF: 1 << 19,
        };
        let defaultPriv = system.get('default.priv') as number;
        for (const key in list) {
            if (defaultPriv & list[key]) defaultPriv -= list[key];
        }
        await system.set('default.priv', defaultPriv);
        for (const key in list) {
            await user.coll.updateMany(
                { priv: { $bitsAllSet: list[key] } },
                { $inc: { priv: -list[key] } },
            );
        }
        return true;
    },
    async function _75_76() {
        const messages = await db.collection('message').find({ content: { $type: 'object' } }).toArray();
        for (const m of messages) {
            let content = '';
            for (const key in m) content += m[key];
            await db.collection('message').updateOne({ _id: m._id }, { $set: { content } });
        }
        return true;
    },
    async function _76_77() {
        return await iterateAllProblem(['domainId', 'title', 'docId', 'data'], async (pdoc, current, total) => {
            if (!pdoc.data?.find((i) => i.name.includes('/'))) return;
            logger.info(pdoc.domainId, pdoc.docId, pdoc.title, pdoc.data.map((i) => i._id));
            const prefix = `problem/${pdoc.domainId}/${pdoc.docId}/testdata/`;
            for (const file of pdoc.data) {
                if (!file._id.includes('/')) continue;
                let newName = file._id.split('/')[1].toLowerCase();
                if (pdoc.data.find((i) => i._id === newName)) {
                    newName = file._id.replace(/\//g, '_').toLowerCase();
                }
                await StorageModel.rename(`${prefix}${file._id}`, `${prefix}${newName}`);
                file._id = newName;
                file.name = newName;
            }
            await problem.edit(pdoc.domainId, pdoc.docId, { data: pdoc.data });
        });
    },
    async function _77_78() {
        await document.coll.updateMany({ docType: document.TYPE_DISCUSSION }, { $set: { hidden: false } });
        return true;
    },
    async function _78_79() {
        const t = await document.collStatus.find({
            docType: document.TYPE_CONTEST, journal: { $elemMatch: { rid: null } },
        }).toArray();
        for (const r of t) {
            r.journal = r.journal.filter((i) => i.rid !== null);
            await document.collStatus.updateOne({ _id: r._id }, { $set: { journal: r.journal } });
        }
        return await iterateAllContest(async (tdoc) => {
            if (tdoc.rule !== 'acm') return;
            logger.info(tdoc.domainId, tdoc.title);
            await contest.recalcStatus(tdoc.domainId, tdoc.docId);
            if (contest.isDone(tdoc)) await contest.unlockScoreboard(tdoc.domainId, tdoc.docId);
        });
    },
    async function _79_80() {
        return await iterateAllDomain(async ({ _id }) => {
            const cursor = discussion.getMulti(_id, { parentType: document.TYPE_CONTEST });
            for await (const ddoc of cursor) {
                try {
                    await contest.get(_id, ddoc.parentId as ObjectId);
                } catch (e) {
                    await discussion.del(_id, ddoc.docId);
                }
            }
        });
    },
    async function _80_81() {
        await document.coll.updateMany({ docType: document.TYPE_TRAINING, pin: false }, { $set: { pin: 0 } });
        await document.coll.updateMany({ docType: document.TYPE_TRAINING, pin: true }, { $set: { pin: 1 } });
        return true;
    },
    async function _81_82() {
        return await iterateAllUser(async (udoc) => {
            if (!udoc.pinnedDomains) return;
            let pinnedDomains = new Set<string>();
            for (const d of udoc.pinnedDomains) {
                if (typeof d === 'string') pinnedDomains.add(d);
                else pinnedDomains = Set.union(pinnedDomains, d);
            }
            await user.setById(udoc._id, { pinnedDomains: Array.from(pinnedDomains) });
        });
    },
    async function _82_83() {
        await document.coll.updateMany({ docType: document.TYPE_CONTEST, assign: null }, { $set: { assign: [] } });
        return true;
    },
    async function _83_84() {
        const tdocs = await document.coll.find({ docType: document.TYPE_CONTEST, rule: 'strictioi' }).toArray();
        for (const tdoc of tdocs) {
            logger.info(tdoc.domainId, tdoc.title);
            const rdocs = await RecordModel.coll.find({ domainId: tdoc.domainId, contest: tdoc.docId }).toArray();
            for (const rdoc of rdocs) {
                await document.revPushStatus(tdoc.domainId, document.TYPE_CONTEST, tdoc.docId, rdoc.uid, 'journal', {
                    rid: rdoc._id, pid: rdoc.pid, status: rdoc.status, score: rdoc.score, subtasks: rdoc.subtasks,
                }, 'rid');
            }
            await contest.recalcStatus(tdoc.domainId, tdoc.docId);
        }
        return true;
    },
    async function _84_85() {
        return await iterateAllDomain(async ({ _id }) => {
            const cursor = discussion.getMulti(_id, { parentType: document.TYPE_CONTEST });
            for await (const ddoc of cursor) {
                const parentId = new ObjectId(ddoc.parentId);
                await discussion.edit(_id, ddoc.docId, { parentId });
                try {
                    await contest.get(_id, parentId);
                } catch (e) {
                    await discussion.del(_id, ddoc.docId);
                }
            }
        });
    },
    null,
    async function _86_87() {
        logger.info('Removing unused files...');
        return await iterateAllDomain(async ({ _id }) => {
            logger.info('Processing domain %s', _id);
            const contestFilesList = await StorageModel.list(`contest/${_id}`);
            const trainingFilesList = await StorageModel.list(`training/${_id}`);
            const tdocs = await contest.getMulti(_id, {}).toArray();
            const trdocs = await training.getMulti(_id, {}).toArray();
            let existsFiles = [];
            for (const tdoc of tdocs) existsFiles = existsFiles.concat((tdoc.files || []).map((i) => `contest/${_id}/${tdoc.docId}/${i.name}`));
            await StorageModel.del(contestFilesList.filter((i) => !existsFiles.includes(i.name)).map((i) => i.name));
            existsFiles = [];
            for (const tdoc of trdocs) existsFiles = existsFiles.concat((tdoc.files || []).map((i) => `training/${_id}/${tdoc.docId}/${i.name}`));
            await StorageModel.del(trainingFilesList.filter((i) => !existsFiles.includes(i.name)).map((i) => i.name));
            logger.info('Domain %s done', _id);
        });
    },
    async function _87_88() {
        return await iterateAllDomain(async (ddoc) => {
            for (const role of Object.keys(ddoc.roles)) {
                if (role === 'root') continue;
                ddoc.roles[role] = (BigInt(ddoc.roles[role]) | PERM.PERM_VIEW_RECORD).toString();
            }
            await domain.setRoles(ddoc._id, ddoc.roles);
        });
    },
    async function _88_89() {
        const cursor = RecordModel.getMulti(undefined, {
            status: STATUS.STATUS_ACCEPTED,
            contest: { $nin: [RecordModel.RECORD_PRETEST, RecordModel.RECORD_GENERATE] },
        });
        let bulk = RecordModel.collStat.initializeUnorderedBulkOp();
        for await (const doc of cursor) {
            bulk.find({ _id: doc._id }).upsert().updateOne({
                $set: {
                    domainId: doc.domainId,
                    pid: doc.pid,
                    uid: doc.uid,
                    time: doc.time,
                    memory: doc.memory,
                    length: doc.code?.length || 0,
                    lang: doc.lang,
                },
            });
            if (bulk.batches.length > 500) {
                await bulk.execute();
                bulk = RecordModel.collStat.initializeUnorderedBulkOp();
            }
        }
        if (bulk.batches.length) await bulk.execute();
        return true;
    },
    async function _89_90() {
        return await iterateAllUser(async (udoc) => {
            const wanted = handleMailLower(udoc.mail);
            if (wanted !== udoc.mailLower) {
                if (await user.getByEmail('system', wanted)) {
                    console.warn('Email conflict when trying to rename %s to %s', udoc.mailLower, wanted);
                    return;
                }
                await user.coll.updateOne({ _id: udoc._id }, { $set: { mailLower: wanted } });
            }
        });
    },
    async function _90_91() {
        await document.collStatus.updateMany({ docType: document.TYPE_PROBLEM }, { $unset: { nSubmit: '', nAccept: '' } });
        const psdocs = await document.coll.find({ docType: document.TYPE_PROBLEM_SOLUTION, vote: { $ne: 0 } })
            .project({ docId: 1, domainId: 1 }).toArray();
        for (const psdoc of psdocs) {
            const filter = { docType: document.TYPE_PROBLEM_SOLUTION, domainId: psdoc.domainId, docId: psdoc.docId };
            const [upvote, downvote] = await Promise.all([
                document.collStatus.countDocuments({ ...filter, vote: 1 }),
                document.collStatus.countDocuments({ ...filter, vote: -1 }),
            ]);
            if (upvote - downvote !== psdoc.vote) {
                await document.set(psdoc.domainId, document.TYPE_PROBLEM_SOLUTION, psdoc.docId, { vote: upvote - downvote });
            }
        }
        await iterateAllProblem(['domainId', 'docId', 'tag'], async (pdoc) => {
            if (pdoc.tag?.some((i) => typeof i !== 'string')) {
                return { tag: pdoc.tag.filter((i) => i).map((i) => i.toString()) };
            }
        });
        return await iterateAllProblem(['domainId', 'docId', 'content', 'html'], async (pdoc) => {
            try {
                const parsed = JSON.parse(pdoc.content);
                if (parsed instanceof Array) {
                    return { content: buildContent(parsed as any, pdoc.html ? 'html' : 'markdown') };
                }
                const res = {};
                for (const key in parsed) {
                    if (typeof parsed[key] === 'string') res[key] = parsed[key];
                    else res[key] = buildContent(parsed[key]);
                }
                return { content: JSON.stringify(res) };
            } catch { }
        });
    },
];
