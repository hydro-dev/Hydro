/* eslint-disable no-await-in-loop */
import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import AdmZip from 'adm-zip';
import xml2js from 'xml2js';
import { ObjectID } from 'bson';
import { filter } from 'lodash';
import decodeHTML from 'decode-html';
import { LocalProblemConfig } from 'hydrooj';
import {
    Route, Handler, param, Types,
} from 'hydrooj/dist/service/server';
import { streamToBuffer } from 'hydrooj/dist/utils';
import { ProblemAdd } from 'hydrooj/dist/lib/ui';
import * as file from 'hydrooj/dist/model/file';
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
            const content = [];
            if (p.description) {
                content.push(
                    `<h2>${this.translate('Description')}</h2>`,
                    ...p.description,
                );
            }
            if (p.input) {
                content.push(
                    `<h2>${this.translate('Input Format')}</h2>`,
                    ...p.input,
                );
            }
            if (p.output) {
                content.push(
                    `<h2>${this.translate('Output Format')}</h2>`,
                    ...p.output,
                );
            }
            if (p.sample_input) {
                if (p.sample_input.length === 1) {
                    content.push(
                        `<h2>${this.translate('Sample Input')}</h2>`,
                        `<pre><code>${p.sample_input[0]}</code></pre>`,
                        `<h2>${this.translate('Sample Output')}</h2>`,
                        `<pre><code>${p.sample_output[0]}</code></pre>`,
                    );
                } else {
                    for (let i = 0; i < p.sample_input.length; i++) {
                        content.push(
                            `<h2>${this.translate('Sample Input')}${i + 1}</h2>`,
                            `<pre><code>${p.sample_input[i]}</code></pre>`,
                            `<h2>${this.translate('Sample Output')}${i + 1}</h2>`,
                            `<pre><code>${p.sample_output[i]}</code></pre>`,
                        );
                    }
                }
            }
            if (p.hint) {
                content.push(
                    `<h2>${this.translate('Hint')}</h2>`,
                    ...p.hint,
                );
            }
            const config: LocalProblemConfig = {
                time: p.time_limit[0]._ + p.time_limit[0].$.unit,
                memory: p.memory_limit[0]._ + p.memory_limit[0].$.unit,
            };
            const title = decodeHTML(p.title.join(' '));
            const tags = filter(p.source, (i: string) => i.trim());
            const pid = await problem.add(domainId, null, title, content.join('\n'), this.user._id, tags, []);
            testdata.addFile('config.yaml', Buffer.from(`time: ${config.time}\nmemory: ${config.memory}`));
            if (p.test_output) {
                for (let i = 0; i < p.test_input.length; i++) {
                    testdata.addFile(`${i + 1}.in`, Buffer.from(p.test_input[i]));
                    testdata.addFile(`${i + 1}.out`, Buffer.from(p.test_output[i]));
                }
            } else {
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
