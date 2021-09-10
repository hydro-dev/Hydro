/* eslint-disable no-await-in-loop */
import AdmZip from 'adm-zip';
import decodeHTML from 'decode-html';
import fs from 'fs-extra';
import { filter } from 'lodash';
import xml2js from 'xml2js';
import type { ContentNode, ProblemConfigFile } from 'hydrooj';
import { FileTooLargeError, ValidationError } from 'hydrooj/src/error';
import { buildContent } from 'hydrooj/src/lib/content';
import { ProblemAdd } from 'hydrooj/src/lib/ui';
import { PERM } from 'hydrooj/src/model/builtin';
import problem from 'hydrooj/src/model/problem';
import solution from 'hydrooj/src/model/solution';
import { Handler, Route } from 'hydrooj/src/service/server';

class FpsProblemImportHandler extends Handler {
    async get() {
        this.response.template = 'problem_import.html';
    }

    async run(domainId: string, result: any) {
        for (const p of result.fps.item) {
            const content: ContentNode[] = [];
            if (p.description?.[0]) {
                content.push({
                    type: 'Text',
                    subType: 'html',
                    sectionTitle: this.translate('Description'),
                    text: p.description[0],
                });
            }
            if (p.input?.[0]) {
                content.push({
                    type: 'Text',
                    subType: 'html',
                    sectionTitle: this.translate('Input Format'),
                    text: p.input[0],
                });
            }
            if (p.output?.[0]) {
                content.push({
                    type: 'Text',
                    subType: 'html',
                    sectionTitle: this.translate('Output Format'),
                    text: p.output[0],
                });
            }
            if (p.sample_input?.length) {
                content.push(...p.sample_input.map((input, i) => ({
                    type: 'Sample',
                    sectionTitle: this.translate('Sample'),
                    payload: [input, p.sample_output[i]],
                })));
            }
            if (p.hint?.[0]) {
                content.push({
                    type: 'Text',
                    subType: 'html',
                    sectionTitle: this.translate('Hint'),
                    text: p.hint[0],
                });
            }
            const config: ProblemConfigFile = {
                time: p.time_limit[0]._ + p.time_limit[0].$.unit,
                memory: p.memory_limit[0]._ + p.memory_limit[0].$.unit,
            };
            const title = decodeHTML(p.title.join(' '));
            const tags = filter(p.source, (i: string) => i.trim());
            const pid = await problem.add(domainId, null, title, buildContent(content, 'html'), this.user._id, tags);
            await problem.addTestdata(domainId, pid, 'config.yaml', Buffer.from(`time: ${config.time}\nmemory: ${config.memory}`));
            if (p.test_output) {
                for (let i = 0; i < p.test_input.length; i++) {
                    const input = typeof p.test_input[i]?._ === 'string'
                        ? p.test_input[i]?._
                        : typeof p.test_input[i] === 'string'
                            ? p.test_input[i]
                            : '';
                    const output = typeof p.test_output[i]?._ === 'string'
                        ? p.test_output[i]?._
                        : typeof p.test_output[i] === 'string'
                            ? p.test_output[i]
                            : '';
                    await problem.addTestdata(domainId, pid, `${i + 1}.in`, Buffer.from(input));
                    await problem.addTestdata(domainId, pid, `${i + 1}.out`, Buffer.from(output));
                }
            } else if (p.test_input) {
                for (let i = 0; i < p.test_input.length / 2; i++) {
                    await problem.addTestdata(domainId, pid, `${i + 1}.in`, Buffer.from(p.test_input[2 * i]));
                    await problem.addTestdata(domainId, pid, `${i + 1}.out`, Buffer.from(p.test_input[2 * i + 1]));
                }
            }
            await problem.edit(domainId, pid, { html: true });
            if (p.solution) {
                let s = '';
                for (const sol of p.solution) {
                    s += `**${sol.$.language}** :  \n\`\`\`\n${sol._}\n\`\`\`\n`;
                }
                await solution.add(domainId, pid, this.user._id, s);
            }
        }
    }

    async post({ domainId }) {
        if (!this.request.files.file) throw new ValidationError('file');
        const tasks = [];
        try {
            const file = await fs.stat(this.request.files.file.path);
            if (file.size > 64 * 1024 * 1024) throw new FileTooLargeError('64m');
            const content = fs.readFileSync(this.request.files.file.path, 'utf-8');
            const result = await xml2js.parseStringPromise(content);
            tasks.push(result);
        } catch (e) {
            console.log(e);
            const zip = new AdmZip(this.request.files.file.path);
            for (const entry of zip.getEntries()) {
                try {
                    const buf = entry.getData();
                    if (buf.byteLength > 64 * 1024 * 1024) throw new FileTooLargeError('64m');
                    const content = buf.toString();
                    const result = await xml2js.parseStringPromise(content);
                    tasks.push(result);
                } catch { }
            }
        }
        if (!tasks.length) throw new ValidationError('file');
        for (const task of tasks) await this.run(domainId, task);
        this.response.redirect = this.url('problem_main');
    }
}

export async function apply() {
    Route('problem_import_fps', '/problem/import/fps', FpsProblemImportHandler, PERM.PERM_CREATE_PROBLEM);
    ProblemAdd('problem_import_fps', {}, 'copy', 'From FPS File');
}

global.Hydro.handler.fpsImport = apply;
