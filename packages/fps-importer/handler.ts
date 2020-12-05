/* eslint-disable no-await-in-loop */
import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import AdmZip from 'adm-zip';
import xml2js from 'xml2js';
import { ObjectID } from 'mongodb';
import { filter } from 'lodash';
import decodeHTML from 'decode-html';
import { LocalProblemConfig } from 'hydrooj';
import {
    Route, Handler, param, Types,
} from 'hydrooj/dist/service/server';
import { streamToBuffer } from 'hydrooj/dist/utils';
import { buildContent } from 'hydrooj/dist/lib/content';
import { ProblemAdd } from 'hydrooj/dist/lib/ui';
import * as file from 'hydrooj/dist/model/file';
import * as solution from 'hydrooj/dist/model/solution';
import { PERM } from 'hydrooj/dist/model/builtin';

const processing = {};

class FpsProblemImportHandler extends Handler {
    @param('ufid', Types.ObjectID, true)
    async get(domainId: string, ufid?: ObjectID) {
        if (ufid) {
            if (processing[ufid.toHexString()]) {
                this.response.body = 'Processing';
                return;
            }
            const stream = await file.get(ufid);
            processing[ufid.toHexString()] = true;
            try {
                const buf = await streamToBuffer(stream);
                let input = buf.toString();
                try {
                    await xml2js.parseStringPromise(input);
                } catch (e) {
                    const zip = new AdmZip(buf);
                    const entries = zip.getEntries();
                    for (const entry of entries) {
                        if (entry.entryName.endsWith('.xml')) {
                            input = entry.getData().toString();
                            break;
                        }
                    }
                }
                // @ts-ignore
                await this.post({ domainId, input });
                await file.del(ufid);
            } catch (e) {
                processing[ufid.toHexString()] = false;
                throw e;
            }
        } else this.response.template = 'problem_import_fps.html';
    }

    @param('input', Types.String)
    async post(domainId: string, input: string) {
        const result = await xml2js.parseStringPromise(input);
        const problem = global.Hydro.model.problem;
        for (const p of result.fps.item) {
            const testdata = new AdmZip();
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
            testdata.addFile('config.yaml', Buffer.from(`time: ${config.time}\nmemory: ${config.memory}`));
            if (p.test_output) {
                for (let i = 0; i < p.test_input.length; i++) {
                    testdata.addFile(`${i + 1}.in`, Buffer.from(p.test_input[i]));
                    testdata.addFile(`${i + 1}.out`, Buffer.from(p.test_output[i]));
                }
            } else if (p.test_input) {
                for (let i = 0; i < p.test_input.length / 2; i++) {
                    testdata.addFile(`${i + 1}.in`, Buffer.from(p.test_input[2 * i]));
                    testdata.addFile(`${i + 1}.out`, Buffer.from(p.test_input[2 * i + 1]));
                }
            }
            const f = path.resolve(os.tmpdir(), 'hydro', `${Math.random()}.zip`);
            await new Promise((resolve, reject) => {
                testdata.writeZip(f, (err) => {
                    if (err) reject(err);
                    resolve();
                });
            });
            await problem.setTestdata(domainId, pid, f);
            await problem.edit(domainId, pid, { html: true });
            if (p.solution) {
                let s = '';
                for (const sol of p.solution) {
                    s += `**${sol.$.language}** :  \n\`\`\`\n${sol._}\n\`\`\`\n`;
                }
                await solution.add(domainId, pid, this.user._id, s);
            }
            await fs.unlink(f);
        }
        this.response.body = { count: result.fps.item.length };
        this.response.redirect = this.url('problem_main');
    }
}

export async function apply() {
    Route('problem_import_fps', '/problem/import/fps', FpsProblemImportHandler, PERM.PERM_CREATE_PROBLEM);
    ProblemAdd('problem_import_fps', {}, 'copy', 'From FPS File');
}

global.Hydro.handler.fpsImport = apply;
