import fs from 'fs';
import path from 'path';
import os from 'os';
import assert from 'assert';
import superagent from 'superagent';
import { ValidationError, RemoteOnlineJudgeError } from '../error';
import * as problem from '../model/problem';
import { PERM } from '../model/builtin';
import {
    Route, Handler, Types, param,
} from '../service/server';
import { isPid } from '../lib/validator';
import download from '../lib/download';

const RE_SYZOJ = /https?:\/\/([a-zA-Z0-9.]+)\/problem\/([0-9]+)\/?/i;

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

    @param('url', Types.String)
    @param('pid', Types.String, true, isPid)
    @param('hidden', Types.Boolean)
    async post(domainId: string, url: string, targetPid: string, hidden = false) {
        assert(url.match(RE_SYZOJ), new ValidationError('url'));
        if (!url.endsWith('/')) url += '/';
        const [, host, pid] = RE_SYZOJ.exec(url);
        const res = await superagent.get(`${url}export`);
        assert(res.status === 200, new RemoteOnlineJudgeError('Cannot connect to target server'));
        assert(res.body.success, new RemoteOnlineJudgeError((res.body.error || {}).message));
        const p = res.body.obj;
        const content = [];
        if (p.description) {
            content.push(
                `## ${this.translate('Description')}`,
                p.description,
            );
        }
        if (p.input_format) {
            content.push(
                `## ${this.translate('Input Format')}`,
                p.input_format,
            );
        }
        if (p.output_format) {
            content.push(
                `## ${this.translate('Output Format')}`,
                p.output_format,
            );
        }
        if (p.example) content.push(p.example);
        if (p.hint) {
            content.push(
                `## ${this.translate('Hint')}`,
                p.hint,
            );
        }
        if (p.limit_and_hint) {
            content.push(
                `## ${this.translate('Limit And Hint')}`,
                p.limit_and_hint,
            );
        }
        if (p.have_additional_file) {
            content.push(
                `## ${this.translate('Additional File')}`,
                `${url}download/additional_file`,
            );
        }
        const docId = await problem.add(
            domainId, targetPid || `${host}_${pid}`, p.title, content.join('  \n'), this.user._id,
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
        await problem.setTestdata(domainId, docId, file);
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

export async function apply() {
    Route('problem_import_syzoj', '/problem/import/syzoj', ProblemImportSYZOJHandler, PERM.PERM_CREATE_PROBLEM);
}

global.Hydro.handler['import.syzoj'] = apply;
