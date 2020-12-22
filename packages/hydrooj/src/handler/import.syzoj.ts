import fs from 'fs';
import path from 'path';
import os from 'os';
import assert from 'assert';
import superagent from 'superagent';
import { filter } from 'lodash';
import { PassThrough } from 'stream';
import AdmZip from 'adm-zip';
import { ValidationError, RemoteOnlineJudgeError } from '../error';
import { Logger } from '../logger';
import type { ContentNode } from '../interface';
import * as problem from '../model/problem';
import { PERM } from '../model/builtin';
import {
    Route, Handler, Types, param, post,
} from '../service/server';
import storage from '../service/storage';
import { isPid } from '../lib/validator';
import download from '../lib/download';

const RE_SYZOJ = /(https?):\/\/([a-zA-Z0-9.:]+)\/(problem|p)\/([0-9]+)\/?/i;
const logger = new Logger('import.syzoj');

class ProblemImportSYZOJHandler extends Handler {
    async get() {
        this.response.template = 'problem_import_syzoj.html';
        this.response.body = {
            path: [
                ['Hydro', 'homepage'],
                ['problem_main', 'problem_main'],
                ['problem_import_syzoj', null],
            ],
        };
    }

    @post('url', Types.String, true)
    @param('pid', Types.String, true, isPid)
    @param('hidden', Types.Boolean)
    async post(domainId: string, url: string, targetPid: string, hidden = false) {
        assert(url.match(RE_SYZOJ), new ValidationError('url'));
        if (!url.endsWith('/')) url += '/';
        const [, protocol, host, n, pid] = RE_SYZOJ.exec(url);
        if (n === 'p') {
            // SYZOJ-NG
            const result = await superagent.post(`${protocol}://${host === 'loj.ac' ? 'api.loj.ac.cn' : host}/api/problem/getProblem`)
                .send({
                    displayId: +pid,
                    localizedContentsOfAllLocales: true,
                    tagsOfLocale: this.user.viewLang || this.session.viewLang,
                    samples: true,
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
                content[c.locale] = sections;
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
                domainId, targetPid || `${host}_${pid}`, title, content, this.user._id,
                tags || [], [], null, hidden,
            );
            (async () => {
                const judge = result.body.judgeInfo;
                const r = await superagent.post(`${protocol}://${host === 'loj.ac' ? 'api.loj.ac.cn' : host}/api/problem/downloadProblemFiles`)
                    .send({
                        problemId: +pid,
                        type: 'TestData',
                        filenameList: result.body.testData.map((node) => node.filename),
                    });
                const urls = {};
                if (r.body.error) return;
                for (const t of r.body.downloadInfo) urls[t.filename] = t.downloadUrl;
                for (const f of result.body.testData) {
                    const p = new PassThrough();
                    superagent.get(urls[f.filename]).pipe(p);
                    // eslint-disable-next-line no-await-in-loop
                    await storage.put(`problem/${domainId}/${docId}/testdata/${f.filename}`, p);
                }
                // TODO additional_file
                if (judge) {
                    await problem.edit(domainId, docId, {
                        config: {
                            time: `${judge.timeLimit}ms`,
                            memory: `${judge.memoryLimit}m`,
                            // TODO other config
                        },
                    });
                }
            })().catch(logger.error);
            this.response.body = { pid: docId };
            this.response.redirect = this.url('problem_settings', { pid: docId });
        } else {
            const res = await superagent.get(`${url}export`);
            assert(res.status === 200, new RemoteOnlineJudgeError('Cannot connect to target server'));
            assert(res.body.success, new RemoteOnlineJudgeError((res.body.error || {}).message));
            const p = res.body.obj;
            const content: ContentNode[] = [];
            if (p.description) {
                content.push({
                    type: 'Text',
                    subType: 'markdown',
                    sectionTitle: this.translate('Description'),
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
                    type: 'Plain',
                    subType: 'markdown',
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
                    text: p.output_format,
                });
            }
            if (p.have_additional_file) {
                content.push({
                    type: 'Text',
                    subType: 'markdown',
                    sectionTitle: this.translate('Additional File'),
                    text: `${url}download/additional_file`,
                });
            }
            const docId = await problem.add(
                domainId, targetPid || `${host}_${pid}`, p.title, content, this.user._id,
                p.tags || [], [], null, hidden,
            );
            const r = download(`${url}testdata/download`);
            const file = path.resolve(os.tmpdir(), 'hydro', `import_${domainId}_${docId}.zip`);
            const w = fs.createWriteStream(file);
            await new Promise((resolve, reject) => {
                w.on('finish', resolve);
                w.on('error', reject);
                r.pipe(w);
            });
            const zip = new AdmZip(file);
            const entries = zip.getEntries();
            for (const entry of entries) {
                // eslint-disable-next-line no-await-in-loop
                await storage.put(`problem/${domainId}/${docId}/testdata/${entry.entryName}`, entry.getData());
            }
            await problem.edit(domainId, docId, {
                config: {
                    time: `${p.time_limit}ms`,
                    memory: `${p.memory_limit}m`,
                    filename: p.file_io_input_name.split('.')[0],
                    type: p.type === 'traditional' ? 'default' : p.type,
                },
            });
            this.response.body = { pid: pid || docId };
            this.response.redirect = this.url('problem_settings', { pid: pid || docId });
        }
    }
}

export async function apply() {
    Route('problem_import_syzoj', '/problem/import/syzoj', ProblemImportSYZOJHandler, PERM.PERM_CREATE_PROBLEM);
}

global.Hydro.handler['import.syzoj'] = apply;
