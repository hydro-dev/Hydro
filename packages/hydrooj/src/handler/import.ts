/* eslint-disable no-await-in-loop */
import assert from 'assert';
import os from 'os';
import path from 'path';
import { PassThrough } from 'stream';
import AdmZip from 'adm-zip';
import fs from 'fs-extra';
import yaml from 'js-yaml';
import { filter } from 'lodash';
import superagent from 'superagent';
import { noop } from '@hydrooj/utils/lib/utils';
import { RemoteOnlineJudgeError, ValidationError } from '../error';
import type { ContentNode, ProblemConfigFile, SubtaskConfig } from '../interface';
import { buildContent } from '../lib/content';
import download from '../lib/download';
import { ProblemAdd } from '../lib/ui';
import { isPid, parsePid } from '../lib/validator';
import { Logger } from '../logger';
import { PERM, PRIV } from '../model/builtin';
import problem, { ProblemDoc } from '../model/problem';
import TaskModel from '../model/task';
import {
    Handler, post, Route, Types,
} from '../service/server';

const RE_SYZOJ = /(https?):\/\/([^/]+)\/(problem|p)\/([0-9]+)\/?/i;
const logger = new Logger('import.syzoj');

const ScoreTypeMap = {
    GroupMin: 'min',
    Sum: 'sum',
    GroupMul: 'max',
};
const LanguageMap = {
    cpp: 'cc',
};

async function syzojSync(info) {
    const {
        protocol, host, domainId, docId,
    } = info;
    const body = JSON.parse(info.body);
    const pid = body.meta.id;
    const judge = body.judgeInfo;
    const rename = {};
    if (judge) {
        const config: ProblemConfigFile = {
            time: `${judge.timeLimit}ms`,
            memory: `${judge.memoryLimit}m`,
        };
        if (judge.extraSourceFiles) {
            const user_extra_files = [];
            for (const key in judge.extraSourceFiles) {
                for (const file in judge.extraSourceFiles[key]) {
                    user_extra_files.push(file);
                }
            }
            config.user_extra_files = user_extra_files;
        }
        if (judge.checker?.type === 'custom') {
            config.checker_type = judge.checker.interface;
            if (LanguageMap[judge.checker.language]) {
                rename[judge.checker.filename] = `chk.${LanguageMap[judge.checker.language]}`;
                config.checker = `chk.${LanguageMap[judge.checker.language]}`;
            } else config.checker = judge.checker.filename;
        }
        if (judge.subtasks?.length) {
            config.subtasks = [];
            for (const subtask of judge.subtasks) {
                const current: SubtaskConfig = {
                    score: subtask.points,
                    type: ScoreTypeMap[subtask.scoringType],
                    cases: subtask.testcases.map((i) => ({ input: i.inputFile, output: i.outputFile })),
                };
                if (subtask.dependencies) current.if = subtask.dependencies;
                config.subtasks.push(current);
            }
        }
        await problem.addTestdata(domainId, docId, 'config.yaml', Buffer.from(yaml.dump(config)));
    }
    const r = await superagent.post(`${protocol}://${host === 'loj.ac' ? 'api.loj.ac.cn' : host}/api/problem/downloadProblemFiles`)
        .send({
            problemId: pid,
            type: 'TestData',
            filenameList: body.testData.map((node) => node.filename),
        });
    if (r.body.error) throw new Error(r.body.error.message || r.body.error);
    for (const f of r.body.downloadInfo) {
        const p = new PassThrough();
        superagent.get(f.downloadUrl).pipe(p);
        // eslint-disable-next-line no-await-in-loop
        await problem.addTestdata(domainId, docId, rename[f.filename] || f.filename, p);
    }
    const a = await superagent.post(`${protocol}://${host === 'loj.ac' ? 'api.loj.ac.cn' : host}/api/problem/downloadProblemFiles`)
        .send({
            problemId: pid,
            type: 'AdditionalFile',
            filenameList: body.additionalFiles.map((node) => node.filename),
        });
    if (a.body.error) throw new Error(a.body.error.message || a.body.error);
    for (const f of a.body.downloadInfo) {
        const p = new PassThrough();
        superagent.get(f.downloadUrl).pipe(p);
        // eslint-disable-next-line no-await-in-loop
        await problem.addAdditionalFile(domainId, docId, f.filename, p);
    }
}
TaskModel.Worker.addHandler('import.syzoj', syzojSync);

class ProblemImportSYZOJHandler extends Handler {
    async get() {
        this.response.template = 'problem_import_syzoj.html';
    }

    async v2(domainId: string, target: string, hidden = false, url: string) {
        const res = await superagent.get(`${url}export`);
        assert(res.status === 200, new RemoteOnlineJudgeError('Cannot connect to target server'));
        assert(res.body.success, new RemoteOnlineJudgeError((res.body.error || {}).message));
        const p = res.body.obj;
        const content: ContentNode[] = [];
        if (p.description) {
            content.push({
                type: 'Text',
                subType: 'markdown',
                sectionTitle: this.translate('Problem Description'),
                text: p.description,
            });
        }
        if (p.input_format) {
            content.push({
                type: 'Text',
                subType: 'markdown',
                sectionTitle: this.translate('Input Format'),
                text: p.input_format,
            });
        }
        if (p.output_format) {
            content.push({
                type: 'Text',
                subType: 'markdown',
                sectionTitle: this.translate('Output Format'),
                text: p.output_format,
            });
        }
        if (p.example) {
            content.push({
                type: 'Text',
                subType: 'markdown',
                sectionTitle: this.translate('Sample'),
                text: p.example,
            });
        }
        if (p.hint) {
            content.push({
                type: 'Text',
                subType: 'markdown',
                sectionTitle: this.translate('Hint'),
                text: p.hint,
            });
        }
        if (p.limit_and_hint) {
            content.push({
                type: 'Text',
                subType: 'markdown',
                sectionTitle: this.translate('Limit And Hint'),
                text: p.limit_and_hint,
            });
        }
        const c = buildContent(content, 'markdown');
        const docId = await problem.add(
            domainId, target, p.title, c, this.user._id, p.tags || [], hidden,
        );
        const r = download(`${url}testdata/download`);
        const file = path.resolve(os.tmpdir(), 'hydro', `import_${domainId}_${docId}.zip`);
        const w = fs.createWriteStream(file);
        try {
            await new Promise((resolve, reject) => {
                w.on('finish', resolve);
                w.on('error', reject);
                r.pipe(w);
            });
            const zip = new AdmZip(file);
            const entries = zip.getEntries();
            for (const entry of entries) {
                // eslint-disable-next-line no-await-in-loop
                await problem.addTestdata(domainId, docId, entry.entryName, entry.getData());
            }
            const filename = p.file_io_input_name ? p.file_io_input_name.split('.')[0] : null;
            const config = {
                time: `${p.time_limit}ms`,
                memory: `${p.memory_limit}m`,
                filename,
                type: p.type === 'traditional' ? 'default' : p.type,
            };
            await problem.addTestdata(domainId, docId, 'config.yaml', Buffer.from(yaml.dump(config)));
        } finally {
            fs.unlinkSync(file);
        }
        if (p.have_additional_file) {
            const r1 = download(`${url}download/additional_file`);
            const file1 = path.resolve(os.tmpdir(), 'hydro', `import_${domainId}_${docId}_a.zip`);
            const w1 = fs.createWriteStream(file1);
            try {
                await new Promise((resolve, reject) => {
                    w1.on('finish', resolve);
                    w1.on('error', reject);
                    r1.pipe(w1);
                });
                const zip = new AdmZip(file1);
                const entries = zip.getEntries();
                for (const entry of entries) {
                    await problem.addAdditionalFile(domainId, docId, entry.entryName.replace('/', '_'), entry.getData());
                }
            } finally {
                fs.unlinkSync(file1);
            }
        }
        return docId;
    }

    async v3(
        domainId: string, target: string, hidden: boolean,
        protocol: string, host: string, pid: string | number,
        wait = false,
    ) {
        let tagsOfLocale = this.user.viewLang || this.session.viewLang;
        if (tagsOfLocale === 'en') tagsOfLocale = 'en_US';
        else tagsOfLocale = 'zh_CN';
        const result = await superagent.post(`${protocol}://${host === 'loj.ac' ? 'api.loj.ac.cn' : host}/api/problem/getProblem`)
            .send({
                displayId: +pid,
                localizedContentsOfAllLocales: true,
                tagsOfLocale,
                samples: true,
                judgeInfo: true,
                testData: true,
                additionalFiles: true,
            });
        const content = {};
        for (const c of result.body.localizedContentsOfAllLocales) {
            const sections = c.contentSections;
            for (const section of sections) {
                section.subType = 'markdown';
                if (section.type === 'Sample') {
                    section.payload = [
                        result.body.samples[section.sampleId].inputData,
                        result.body.samples[section.sampleId].outputData,
                    ];
                    delete section.sampleId;
                }
            }
            let locale = c.locale;
            if (locale === 'en_US') locale = 'en';
            else if (locale === 'zh_CN') locale = 'zh';
            content[locale] = sections;
        }
        const tags = result.body.tagsOfLocale.map((node) => node.name);
        const title = [
            ...filter(
                result.body.localizedContentsOfAllLocales,
                (node) => node.locale === (this.user.viewLang || this.session.viewLang),
            ),
            ...result.body.localizedContentsOfAllLocales,
        ][0].title;
        const docId = await problem.add(
            domainId, target, title, JSON.stringify(content), this.user._id, tags || [], hidden,
        );
        const payload = {
            protocol, host, pid, domainId, docId, body: JSON.stringify(result.body),
        };
        if (wait) await syzojSync(payload);
        else await TaskModel.add({ ...payload, type: 'schedule', subType: 'import.syzoj' });
        return docId;
    }

    @post('url', Types.Content, true)
    @post('pid', Types.Name, true, isPid, parsePid)
    @post('hidden', Types.Boolean)
    @post('prefix', Types.Name, true)
    @post('start', Types.UnsignedInt, true)
    @post('end', Types.UnsignedInt, true)
    async post(
        domainId: string, url: string, targetPid: string, hidden = false,
        prefix: string, start: number, end: number,
    ) {
        if (/^(.+)\/(\d+)\.\.(\d+)$/.test(url)) {
            const res = /^(.+)\/(\d+)\.\.(\d+)$/.exec(url)!;
            prefix = res[1];
            start = +res[2];
            end = +res[3];
            if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end) {
                throw new ValidationError('end');
            }
        }
        if (prefix) {
            let version = 2;
            if (!prefix.endsWith('/')) prefix += '/';
            if (prefix.endsWith('/p/')) version = 3;
            else prefix = `${prefix.split('/problem/')[0]}/problem/`;
            const base = `${prefix}${start}/`;
            assert(base.match(RE_SYZOJ), new ValidationError('prefix'));
            const [, protocol, host] = RE_SYZOJ.exec(base);
            (async () => {
                for (let i = start; i <= end; i++) {
                    // eslint-disable-next-line no-await-in-loop
                    if (version === 3) await this.v3(domainId, undefined, hidden, protocol, host, i, true).catch(noop);
                    // eslint-disable-next-line no-await-in-loop
                    else await this.v2(domainId, undefined, hidden, `${prefix + i}/`).catch(noop);
                    logger.info('%s %d-%d-%d', prefix, start, i, end);
                }
            })().catch(logger.error);
            this.response.redirect = this.url('problem_main');
        } else {
            assert(url.match(RE_SYZOJ), new ValidationError('url'));
            if (!url.endsWith('/')) url += '/';
            const [, protocol, host, n, pid] = RE_SYZOJ.exec(url);
            const docId = n === 'p'
                ? await this.v3(domainId, targetPid, hidden, protocol, host, pid, false)
                : await this.v2(domainId, targetPid, hidden, url);
            this.response.body = { pid: targetPid || docId };
            this.response.redirect = this.url('problem_detail', { pid: targetPid || docId });
        }
    }
}

class ProblemImportHydroHandler extends Handler {
    async get() {
        this.response.template = 'problem_import.html';
    }

    async post({ domainId, keepUser }) {
        if (keepUser) this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        if (!this.request.files.file) throw new ValidationError('file');
        const tmpdir = path.join(os.tmpdir(), 'hydro', `${Math.random()}.import`);
        const zip = new AdmZip(this.request.files.file.path);
        await new Promise((resolve, reject) => {
            zip.extractAllToAsync(tmpdir, true, (err) => {
                if (err) reject(err);
                resolve(null);
            });
        });
        try {
            const problems = await fs.readdir(tmpdir);
            for (const i of problems) {
                const files = await fs.readdir(path.join(tmpdir, i));
                if (!files.includes('problem.yaml')) continue;
                const content = fs.readFileSync(path.join(tmpdir, i, 'problem.yaml'), 'utf-8');
                const pdoc: ProblemDoc = yaml.load(content) as any;
                const current = await problem.get(domainId, pdoc.pid);
                const pid = current ? undefined : pdoc.pid;
                const overrideContent = fs.existsSync(path.join(tmpdir, i, 'problem.md'))
                    ? fs.readFileSync(path.join(tmpdir, i, 'problem.md'), 'utf8') : '';
                const docId = await problem.add(
                    domainId, pid, pdoc.title, overrideContent || pdoc.content,
                    keepUser ? pdoc.owner : this.user._id, pdoc.tag, pdoc.hidden,
                );
                if (files.includes('testdata')) {
                    const datas = await fs.readdir(path.join(tmpdir, i, 'testdata'), { withFileTypes: true });
                    for (const f of datas) {
                        if (f.isDirectory()) {
                            const sub = await fs.readdir(path.join(tmpdir, i, 'testdata', f.name));
                            for (const s of sub) {
                                const stream = fs.createReadStream(path.join(tmpdir, i, 'testdata', f.name, s));
                                await problem.addTestdata(domainId, docId, `${f.name}/${s}`, stream);
                            }
                        } else if (f.isFile()) {
                            const stream = fs.createReadStream(path.join(tmpdir, i, 'testdata', f.name));
                            await problem.addTestdata(domainId, docId, f.name, stream);
                        }
                    }
                }
                if (files.includes('additional_file')) {
                    const datas = await fs.readdir(path.join(tmpdir, i, 'additional_file'), { withFileTypes: true });
                    for (const f of datas) {
                        if (f.isFile()) {
                            const stream = fs.createReadStream(path.join(tmpdir, i, 'additional_file', f.name));
                            await problem.addAdditionalFile(domainId, docId, f.name, stream);
                        }
                    }
                }
            }
        } finally {
            await fs.remove(tmpdir);
        }
        this.response.redirect = this.url('problem_main');
    }
}

export async function apply() {
    ProblemAdd('problem_import_hydro', {}, 'copy', 'Import From Hydro');
    Route('problem_import_syzoj', '/problem/import/syzoj', ProblemImportSYZOJHandler, PERM.PERM_CREATE_PROBLEM);
    Route('problem_import_hydro', '/problem/import/hydro', ProblemImportHydroHandler, PERM.PERM_CREATE_PROBLEM);
}

global.Hydro.handler.import = apply;
