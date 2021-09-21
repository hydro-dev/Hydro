/* eslint-disable no-await-in-loop */
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import fs from 'fs-extra';
import yaml from 'js-yaml';
import type { ContentNode, ProblemConfigFile } from 'hydrooj';
import { ValidationError } from 'hydrooj/src/error';
import { buildContent } from 'hydrooj/src/lib/content';
import { ProblemAdd } from 'hydrooj/src/lib/ui';
import { PERM } from 'hydrooj/src/model/builtin';
import problem from 'hydrooj/src/model/problem';
import { Handler, Route } from 'hydrooj/src/service/server';

fs.ensureDirSync('/tmp/hydro/import-qduoj');

class ImportQduojHandler extends Handler {
    async ImportFromFile(domainId: string, zipfile: string) {
        const zip = new AdmZip(zipfile);
        const tmp = path.resolve(os.tmpdir(), 'hydro', 'import-qduoj', String.random(32));
        await new Promise((resolve, reject) => {
            zip.extractAllToAsync(tmp, true, (err) => (err ? reject(err) : resolve(null)));
        });
        try {
            const folders = await fs.readdir(tmp);
            for (const folder of folders) {
                const buf = await fs.readFile(path.join(tmp, folder, 'problem.json'));
                const pdoc = JSON.parse(buf.toString());
                const content: ContentNode[] = [];
                if (pdoc.description?.value) {
                    content.push({
                        type: 'Text',
                        subType: 'html',
                        sectionTitle: this.translate('Description'),
                        text: pdoc.description.value,
                    });
                }
                if (pdoc.input_description?.value) {
                    content.push({
                        type: 'Text',
                        subType: 'html',
                        sectionTitle: this.translate('Input Format'),
                        text: pdoc.input_description.value,
                    });
                }
                if (pdoc.output_description?.value) {
                    content.push({
                        type: 'Text',
                        subType: 'html',
                        sectionTitle: this.translate('Output Format'),
                        text: pdoc.output_description.value,
                    });
                }
                if (pdoc.samples?.length) {
                    content.push(...pdoc.samples.map((sample) => ({
                        type: 'Sample',
                        sectionTitle: this.translate('Sample'),
                        payload: [sample.input, sample.output],
                    })));
                }
                if (pdoc.hint?.value) {
                    content.push({
                        type: 'Text',
                        subType: 'html',
                        sectionTitle: this.translate('Hint'),
                        text: pdoc.hint.value,
                    });
                }
                if (pdoc.source?.value) {
                    content.push({
                        type: 'Text',
                        subType: 'html',
                        sectionTitle: this.translate('Source'),
                        text: pdoc.source.value,
                    });
                }
                if (+pdoc.display_id) pdoc.display_id = `P${pdoc.display_id}`;
                const n = await problem.get(domainId, pdoc.display_id);
                if (n) pdoc.display_id = null;
                const pid = await problem.add(domainId, pdoc.display_id, pdoc.title, buildContent(content, 'html'), this.user._id, pdoc.tags);
                const config: ProblemConfigFile = {
                    time: `${pdoc.time_limit}ms`,
                    memory: `${pdoc.memory_limit}m`,
                    subtasks: [],
                };
                for (const tc of pdoc.test_case_score) {
                    await Promise.all([
                        problem.addTestdata(
                            domainId, pid, tc.input_name,
                            path.join(tmp, folder, 'testcase', tc.input_name),
                        ),
                        problem.addTestdata(
                            domainId, pid, tc.output_name,
                            path.join(tmp, folder, 'testcase', tc.output_name),
                        ),
                    ]);
                    config.subtasks.push({
                        score: tc.score,
                        cases: [{
                            input: tc.input_name,
                            output: tc.output_name,
                        }],
                    });
                }
                await Promise.all([
                    problem.addTestdata(domainId, pid, 'config.yaml', Buffer.from(yaml.dump(config))),
                    problem.edit(domainId, pid, { html: true }),
                ]);
            }
        } finally {
            await fs.remove(tmp);
        }
    }

    async get() {
        this.response.body = { type: 'QDUOJ' };
        this.response.template = 'problem_import.html';
    }

    async post({ domainId }) {
        if (!this.request.files.file) throw new ValidationError('file');
        const stat = await fs.stat(this.request.files.file.path);
        if (stat.size > 128 * 1024 * 1024) throw new ValidationError('file', 'File too large');
        await this.ImportFromFile(domainId, this.request.files.file.path);
        this.response.redirect = this.url('problem_main');
    }
}

export async function apply() {
    Route('problem_import_qduoj', '/problem/import/qduoj', ImportQduojHandler, PERM.PERM_CREATE_PROBLEM);
    ProblemAdd('problem_import_qduoj', {}, 'copy', 'From QDUOJ Export');
}

global.Hydro.handler.qduImport = apply;
