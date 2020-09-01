/* eslint-disable no-await-in-loop */
import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import AdmZip from 'adm-zip';
import xml2js from 'xml2js';
import { LocalProblemConfig } from 'hydrooj';
import { convertHTML } from '@hydrooj/html2md';
import {
    Route, Handler, param, Types,
} from 'hydrooj/dist/service/server';
import { PERM } from 'hydrooj/dist/model/builtin';

class FpsProblemImportHandler extends Handler {
    async get() {
        this.response.template = 'problem_import_fps.html';
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
                    this.translate('problem.import.problem_description'),
                    p.description.map(convertHTML).join('\n'),
                );
            }
            if (p.input) {
                content.push(
                    this.translate('problem.import.input_format'),
                    p.input.map(convertHTML).join('\n'),
                );
            }
            if (p.output) {
                content.push(
                    this.translate('problem.import.output_format'),
                    p.output.map(convertHTML).join('\n'),
                );
            }
            if (p.sample_input) {
                content.push(
                    this.translate('problem.import.sample_input'),
                    // eslint-disable-next-line prefer-template
                    p.sample_input.map((i: string) => ('```\n' + i + '\n```')).join('\n'),
                );
            }
            if (p.sample_output) {
                content.push(
                    this.translate('problem.import.sample_output'),
                    // eslint-disable-next-line prefer-template
                    p.sample_output.map((i: string) => ('```\n' + i + '\n```')).join('\n'),
                );
            }
            if (p.hint) {
                content.push(
                    this.translate('problem.import.hint'),
                    p.hint.map(convertHTML).join('\n'),
                );
            }
            const config: LocalProblemConfig = {
                time: p.time_limit[0]._ + p.time_limit[0].$.unit,
                memory: p.memory_limit[0]._ + p.memory_limit[0].$.unit,
            };
            const pid = await problem.add(domainId, null, p.title.join(' '), content.join('\n'), this.user._id, p.source, []);
            testdata.addFile('config.yaml', Buffer.from(`time:${config.time}\nmemory:${config.memory}`));
            for (let i = 0; i < p.test_input.length; i++) {
                testdata.addFile(`${i + 1}.in`, Buffer.from(p.test_input[i]));
                testdata.addFile(`${i + 1}.out`, Buffer.from(p.test_output[i]));
            }
            const file = path.resolve(os.tmpdir(), 'hydro', `${Math.random()}.zip`);
            await new Promise((resolve, reject) => {
                testdata.writeZip(file, (err) => {
                    if (err) reject(err);
                    resolve();
                });
            });
            await problem.setTestdata(domainId, pid, file);
            await fs.unlink(file);
        }
        this.response.body = { count: result.fps.item.length };
        this.response.redirect = this.url('problem_main');
    }
}

export async function apply() {
    Route('problem_import_fps', '/problem/import/fps', FpsProblemImportHandler, PERM.PERM_CREATE_PROBLEM);
}

global.Hydro.handler.fpsImport = apply;
