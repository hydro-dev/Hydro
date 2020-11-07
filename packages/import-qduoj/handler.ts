/* eslint-disable no-await-in-loop */
import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import AdmZip from 'adm-zip';
import yaml from 'js-yaml';
import { ObjectID } from 'mongodb';
import { LocalProblemConfig } from 'hydrooj';
import {
    Route, Handler, param, Types,
} from 'hydrooj/dist/service/server';
import { BadRequestError } from 'hydrooj/dist/error';
import { streamToBuffer } from 'hydrooj/dist/utils';
import { ProblemAdd } from 'hydrooj/dist/lib/ui';
import * as file from 'hydrooj/dist/model/file';
import * as problem from 'hydrooj/dist/model/problem';
import { PERM } from 'hydrooj/dist/model/builtin';

const processing = {};
fs.ensureDirSync('/tmp/hydro/import-qduoj');

class ImportQduojHandler extends Handler {
    async ImportFromFile(domainId: string, id: string, zipfile: Buffer) {
        const zip = new AdmZip(zipfile);
        const tmp = path.resolve(os.tmpdir(), 'hydro', 'import-qduoj', id);
        await new Promise((resolve, reject) => {
            zip.extractAllToAsync(tmp, true, (err) => (err ? resolve() : reject(err)));
        });
        try {
            const folders = await fs.readdir(tmp);
            for (const folder of folders) {
                const buf = await fs.readFile(path.join(tmp, folder, 'problem.json'));
                const pdoc = JSON.parse(buf.toString());
                const content = [
                    ...pdoc.description?.value
                        ? [
                            '<h2>Description</h2>',
                            pdoc.description.value,
                        ] : [],
                    ...pdoc.input_description?.value
                        ? [
                            '<h2>Input Description</h2>',
                            pdoc.input_description.value,
                        ] : [],
                    ...pdoc.output_description?.value
                        ? [
                            '<h2>Output Description</h2>',
                            pdoc.output_description.value,
                        ] : [],
                    ...(pdoc.samples as any[]).map((sample, i) => [
                        `<h2>Sample Input ${i + 1}</h2><pre>`,
                        sample.input,
                        `</pre><h2>Sample Output ${i + 1}</h2><pre>`,
                        sample.output,
                        '</pre>',
                    ].join('\n')),
                    ...pdoc.hint?.value
                        ? [
                            '<h2>Hint</h2>',
                            pdoc.hint.value,
                        ] : [],
                    ...pdoc.source ? ['<h2>Source</h2>', pdoc.source] : [],
                ].join('\n');
                const pid = await problem.add(domainId, pdoc.display_id, pdoc.title, content, this.user._id, pdoc.tags);
                const testdata = new AdmZip();
                const config: LocalProblemConfig = {
                    time: `${pdoc.time_limit}ms`,
                    memory: `${pdoc.memory_limit}m`,
                    subtasks: [],
                };
                for (const tc of pdoc.test_case_score) {
                    testdata.addLocalFile(path.join(tmp, 'testcase', tc.input_name));
                    testdata.addLocalFile(path.join(tmp, 'testcase', tc.output_name));
                    config.subtasks.push({
                        score: tc.score,
                        cases: [{
                            input: tc.input_name,
                            output: tc.output_name,
                        }],
                    });
                }
                testdata.addFile('config.yaml', Buffer.from(yaml.safeDump(config)));
                const f = path.resolve(os.tmpdir(), 'hydro', `${Math.random()}.zip`);
                await new Promise((resolve, reject) => {
                    testdata.writeZip(f, (err) => (err ? resolve() : reject(err)));
                });
                try {
                    await problem.setTestdata(domainId, pid, f);
                    await problem.edit(domainId, pid, { html: true });
                } finally {
                    await fs.unlink(f);
                }
            }
        } finally {
            await fs.remove(tmp);
        }
    }

    @param('ufid', Types.ObjectID, true)
    async get(domainId: string, ufid?: ObjectID) {
        if (ufid) {
            if (processing[ufid.toHexString()]) {
                this.response.body = 'Processing';
                return;
            }
            const stat = await file.getMeta(ufid);
            if (stat.size > 128 * 1024 * 1024) throw new BadRequestError('File too large');
            const stream = await file.get(ufid);
            processing[ufid.toHexString()] = true;
            try {
                const buf = await streamToBuffer(stream);
                await this.ImportFromFile(domainId, ufid.toHexString(), buf);
                await file.del(ufid);
            } catch (e) {
                processing[ufid.toHexString()] = false;
                throw e;
            }
        } else this.response.template = 'problem_import_qduoj.html';
    }
}

export async function apply() {
    Route('problem_import_qduoj', '/problem/import/qduoj', ImportQduojHandler, PERM.PERM_CREATE_PROBLEM);
    ProblemAdd('problem_import_qduoj', {}, 'copy', 'From QDUOJ Export');
}

global.Hydro.handler.qduImport = apply;
