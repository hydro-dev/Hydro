/* eslint-disable no-await-in-loop */
import AdmZip from 'adm-zip';
import xml2js from 'xml2js';
import fs from 'fs-extra';
import { filter } from 'lodash';
import decodeHTML from 'decode-html';
import { LocalProblemConfig } from 'hydrooj';
import {
    Route, Handler, param, Types,
} from 'hydrooj/dist/service/server';
import * as storage from 'hydrooj/dist/service/storage';
import { buildContent } from 'hydrooj/dist/lib/content';
import { ProblemAdd } from 'hydrooj/dist/lib/ui';
import * as solution from 'hydrooj/dist/model/solution';
import { PERM } from 'hydrooj/dist/model/builtin';
import { ValidationError } from 'hydrooj/dist/error';

class FpsProblemImportHandler extends Handler {
    async get() {
        this.response.template = 'problem_import.html';
    }

    async run(domainId: string, result: any) {
        const problem = global.Hydro.model.problem;
        for (const p of result.fps.item) {
            const content = buildContent({
                description: p.description,
                input: p.input,
                output: p.output,
                samples: p.sample_input
                    ? p.sample_input.map((si: string, i: number) => [si, p.sample_output[i]])
                    : [],
                hint: p.hint,
            }, 'html', this.translate.bind(this));
            const config: LocalProblemConfig = {
                time: p.time_limit[0]._ + p.time_limit[0].$.unit,
                memory: p.memory_limit[0]._ + p.memory_limit[0].$.unit,
            };
            const title = decodeHTML(p.title.join(' '));
            const tags = filter(p.source, (i: string) => i.trim());
            const pid = await problem.add(domainId, null, title, content, this.user._id, tags, []);
            await storage.put(`problem/${domainId}/${pid}/testdata/config.yaml`, Buffer.from(`time: ${config.time}\nmemory: ${config.memory}`));
            if (p.test_output) {
                for (let i = 0; i < p.test_input.length; i++) {
                    await storage.put(`problem/${domainId}/${pid}/testdata/${i + 1}.in`, Buffer.from(p.test_input[i]));
                    await storage.put(`problem/${domainId}/${pid}/testdata/${i + 1}.out`, Buffer.from(p.test_output[i]));
                }
            } else if (p.test_input) {
                for (let i = 0; i < p.test_input.length / 2; i++) {
                    await storage.put(`problem/${domainId}/${pid}/testdata/${i + 1}.in`, Buffer.from(p.test_input[2 * i]));
                    await storage.put(`problem/${domainId}/${pid}/testdata/${i + 1}.out`, Buffer.from(p.test_input[2 * i + 1]));
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

    @param('input', Types.String, true)
    async post(domainId: string, input: string) {
        if (!input && !this.request.files.file) throw new ValidationError('file');
        const tasks = [];
        if (this.request.files.file) {
            try {
                const content = fs.readFile(this.request.files.file.path).toString();
                const result = await xml2js.parseStringPromise(content);
                tasks.push(result);
            } catch (e) {
                const zip = new AdmZip(this.request.files.file.path);
                for (const entry of zip.getEntries()) {
                    try {
                        const content = entry.getData().toString();
                        const result = await xml2js.parseStringPromise(content);
                        tasks.push(result);
                    } catch { } // eslint-disable-line no-empty
                }
            }
        } else {
            tasks.push(await xml2js.parseStringPromise(input));
        }
        if (!tasks.length) throw new ValidationError('file');
        for (const task of tasks) {
            await this.run(domainId, task);
        }
        this.response.redirect = this.url('problem_main');
    }
}

export async function apply() {
    Route('problem_import_fps', '/problem/import/fps', FpsProblemImportHandler, PERM.PERM_CREATE_PROBLEM);
    ProblemAdd('problem_import_fps', {}, 'copy', 'From FPS File');
}

global.Hydro.handler.fpsImport = apply;
