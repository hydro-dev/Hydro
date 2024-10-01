// Hydro Integration
/* eslint-disable no-await-in-loop */
import path from 'path';
import { fs } from '@hydrooj/utils';
import * as sysinfo from '@hydrooj/utils/lib/sysinfo';
import {
    db, JudgeHandler, JudgeResultBody, ObjectId, RecordModel,
    SettingModel, StorageModel, SystemModel, TaskModel,
} from 'hydrooj';
import { langs } from 'hydrooj/src/model/setting';
import { compilerVersions } from '../compiler';
import { getConfig } from '../config';
import { FormatError, SystemError } from '../error';
import { Context } from '../judge/interface';
import logger from '../log';
import { versionCheck } from '../sandbox';
import { JudgeTask } from '../task';

const session = {
    config: { detail: SystemModel.get('hydrojudge.detail') },
    async fetchFile(name: string) {
        name = name.split('#')[0];
        const target = path.join(getConfig('tmp_dir'), name.replace(/\//g, '_'));
        await StorageModel.get(`submission/${name}`, target);
        return target;
    },
    getNext(t: Context) {
        t._callbackAwait ||= Promise.resolve();
        return (data: Partial<JudgeResultBody>) => {
            logger.debug('Next: %o', data);
            data.rid = new ObjectId(t.rid);
            if (data.case) data.case.message ||= '';
            t._callbackAwait = t._callbackAwait.then(() => JudgeHandler.next({ ...data, domainId: t.request.domainId }));
        };
    },
    getEnd(t: Context) {
        t._callbackAwait ||= Promise.resolve();
        return (data: Partial<JudgeResultBody>) => {
            data.key = 'end';
            data.rid = new ObjectId(t.rid);
            logger.info('End: status=%d score=%d time=%dms memory=%dkb', data.status, data.score, data.time, data.memory);
            t._callbackAwait = t._callbackAwait.then(() => JudgeHandler.end({ ...data, domainId: t.request.domainId }));
        };
    },
    getLang(lang: string, doThrow = true) {
        if (SettingModel.langs[lang]) return SettingModel.langs[lang];
        if (lang === 'cpp' && SettingModel.langs['cc']) return SettingModel.langs['cc'];
        if (doThrow) throw new SystemError('Unsupported language {0}.', [lang]);
        return null;
    },
    async postFile(target: string, filename: string, filepath: string) {
        return await JudgeHandler.processJudgeFileCallback(new ObjectId(target), filename, filepath);
    },
    async cacheOpen(source: string, files: any[]) {
        const filePath = path.join(getConfig('cache_dir'), source);
        await fs.ensureDir(filePath);
        if (!files?.length) throw new FormatError('Problem data not found.');
        let etags: Record<string, string> = {};
        try {
            etags = JSON.parse(await fs.readFile(path.join(filePath, 'etags'), 'utf-8'));
        } catch (e) { /* ignore */ }
        const version = {};
        const filenames = new Set<string>();
        for (const file of files) {
            filenames.add(file.name);
            version[file.name] = file.etag + file.lastModified;
            if (etags[file.name] !== file.etag + file.lastModified) {
                await StorageModel.get(`problem/${source}/testdata/${file.name}`, path.join(filePath, file.name));
            }
        }
        for (const name in etags) {
            if (!filenames.has(name) && fs.existsSync(path.join(filePath, name))) await fs.remove(path.join(filePath, name));
        }
        await Promise.all([
            fs.writeFile(path.join(filePath, 'etags'), JSON.stringify(version)),
            fs.writeFile(path.join(filePath, 'lastUsage'), Date.now().toString()),
        ]);
        return filePath;
    },
};

export async function postInit(ctx) {
    if (SystemModel.get('hydrojudge.disable')) return;
    ctx.inject(['check'], (c) => {
        c.check.addChecker('Judge', (_ctx, log, warn, error) => versionCheck(warn, error));
    });
    await fs.ensureDir(getConfig('tmp_dir'));
    const info = await sysinfo.get();
    const handle = async (t) => {
        const rdoc = await RecordModel.get(t.domainId, t.rid);
        if (!rdoc) {
            logger.debug('Record not found: %o', t);
            return;
        }
        await (new JudgeTask(session, JSON.parse(JSON.stringify(Object.assign(rdoc, t))))).handle().catch(logger.error);
    };
    const parallelism = Math.max(getConfig('parallelism'), 2);
    const taskConsumer = TaskModel.consume({ type: 'judge' }, handle, true, parallelism);
    function collectCompilerInfo() {
        const coll = db.collection('status');
        compilerVersions(langs).then((compilers) => coll.updateOne(
            { mid: info.mid, type: 'server' },
            { $set: { compilers } },
            { upsert: true },
        )).catch((e) => logger.error(e));
    }
    ctx.on('system/setting', () => {
        taskConsumer.setConcurrency(Math.max(getConfig('parallelism'), 2));
        collectCompilerInfo();
    });
    collectCompilerInfo();
    TaskModel.consume({ type: 'judge', priority: { $gt: -50 } }, handle);
    TaskModel.consume({ type: 'generate' }, handle);
}
