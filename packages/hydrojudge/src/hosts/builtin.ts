// Hydro Integration
/* eslint-disable no-await-in-loop */
import path from 'path';
import { fs } from '@hydrooj/utils';
import * as sysinfo from '@hydrooj/utils/lib/sysinfo';
import {
    Context as HydroContext, db, JudgeHandler, JudgeResultCallbackContext,
    ObjectId, RecordModel, SettingModel, StorageModel, TaskModel,
} from 'hydrooj';
import { langs } from 'hydrooj/src/model/setting';
import { getConfig } from '../config';
import { SystemError } from '../error';
import { compilerVersions, stackSize } from '../info';
import { Session } from '../interface';
import { Context } from '../judge/interface';
import logger from '../log';
import { versionCheck } from '../sandbox';
import { JudgeTask } from '../task';

const session: Session = {
    config: { detail: getConfig('detail') },
    async fetchFile(namespace, files) {
        if (namespace === null) {
            const name = Object.keys(files)[0].split('#')[0];
            const target = path.join(getConfig('tmp_dir'), name.replace(/\//g, '_'));
            await StorageModel.get(`submission/${name}`, target);
            return target as any;
        }
        for (const key in files) {
            const target = files[key];
            await StorageModel.get(`problem/${namespace}/testdata/${key}`, target);
        }
        return null;
    },
    getReporter(t: Context) {
        const reporter = new JudgeResultCallbackContext(app, t.request);
        return {
            next: (a) => reporter.next(a),
            end: (a) => reporter.end(a),
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
};

export async function apply(ctx: HydroContext) {
    ctx.inject(['check'], (c) => {
        c.check.addChecker('Judge', async (_ctx, log, warn, error) => {
            await versionCheck(warn, error);
        });
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
    const parallelism = getConfig('parallelism');
    async function collectInfo() {
        const coll = db.collection('status');
        const compilers = await compilerVersions(langs);
        await coll.updateOne(
            { mid: info.mid, type: 'server' },
            { $set: { compilers } },
            { upsert: true },
        );
        const size = await stackSize();
        await coll.updateOne(
            { mid: info.mid, type: 'server' },
            { $set: { stackSize: size } },
            { upsert: true },
        );
    }
    ctx.effect(() => {
        const taskConsumer = TaskModel.consume({ type: 'judge' }, handle, true, parallelism);
        const dispose = ctx.on('system/setting', () => {
            taskConsumer.setConcurrency(getConfig('parallelism'));
            collectInfo();
        });
        return () => {
            taskConsumer.destroy();
            dispose();
        };
    });
    ctx.effect(() => {
        const generateConsumer = TaskModel.consume({ type: 'generate' }, handle);
        return () => generateConsumer.destroy();
    });
    collectInfo();
}
