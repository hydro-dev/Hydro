// Hydro Integration
/* eslint-disable no-await-in-loop */
import path from 'path';
import fs from 'fs-extra';
import type { JudgeResultBody } from 'hydrooj';
import { end, next } from 'hydrooj/src/handler/judge';
import { Logger } from 'hydrooj/src/logger';
import * as setting from 'hydrooj/src/model/setting';
import * as system from 'hydrooj/src/model/system';
import task from 'hydrooj/src/model/task';
import storage from 'hydrooj/src/service/storage';
import { processTestdata } from '../cases';
import { getConfig } from '../config';
import { FormatError, SystemError } from '../error';
import { Context } from '../judge/interface';
import { JudgeTask } from '../task';

const logger = new Logger('judge');

const session = {
    config: { detail: system.get('hydrojudge.detail') },
    async fetchFile(name: string) {
        const target = path.join('/tmp/hydro/judge', name.replace(/\//g, '_'));
        await storage.get(`submission/${name}`, target);
        return target;
    },
    getNext(t: Context) {
        return (data: Partial<JudgeResultBody>) => {
            logger.debug('Next: %d %o', data);
            data.rid = t.rid as any;
            if (data.case) data.case.message ||= '';
            next(data);
        };
    },
    getEnd(t: Context) {
        return (data: Partial<JudgeResultBody>) => {
            data.key = 'end';
            data.rid = t.rid as any;
            logger.info('End: status=%d score=%d time=%dms memory=%dkb', data.status, data.score, data.time, data.memory);
            end(data);
        };
    },
    getLang(lang: string, doThrow = true) {
        if (setting.langs[lang]) return setting.langs[lang];
        if (lang === 'cpp' && setting.langs['cc']) return setting.langs['cc'];
        if (doThrow) throw new SystemError('Unsupported language {0}.', [lang]);
        return null;
    },
    async cacheOpen(source: string, files: any[]) {
        const filePath = path.join(getConfig('cache_dir'), source);
        await fs.ensureDir(filePath);
        if (!files?.length) throw new FormatError('Problem data not found.');
        let etags: Record<string, string> = {};
        try {
            etags = JSON.parse(fs.readFileSync(path.join(filePath, 'etags')).toString());
        } catch (e) { /* ignore */ }
        const version = {};
        const filenames = new Set<string>();
        for (const file of files) {
            filenames.add(file.name);
            version[file.name] = file.etag + file.lastModified;
            if (etags[file.name] !== file.etag + file.lastModified) {
                await storage.get(`problem/${source}/testdata/${file.name}`, path.join(filePath, file.name));
            }
        }
        for (const name in etags) {
            if (!filenames.has(name) && fs.existsSync(path.join(filePath, name))) await fs.remove(path.join(filePath, name));
        }
        fs.writeFileSync(path.join(filePath, 'etags'), JSON.stringify(version));
        fs.writeFileSync(path.join(filePath, 'lastUsage'), Date.now().toString());
        await processTestdata(filePath);
        return filePath;
    },
};

export async function postInit() {
    if (system.get('hydrojudge.disable')) return;
    const handle = (t) => (new JudgeTask(session, t)).handle().catch(logger.error);
    task.consume({ type: 'judge' }, handle);
    task.consume({ type: 'judge', priority: { $gt: -50 } }, handle);
}
