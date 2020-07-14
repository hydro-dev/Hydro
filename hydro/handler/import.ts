import fs from 'fs';
import path from 'path';
import os from 'os';
import { ValidationError } from '../error';
import * as problem from '../model/problem';
import { PERM } from '../model/builtin';
import {
    Route, Handler, Types, param,
} from '../service/server';
import { isPid } from '../lib/validator';

class ProblemImportHandler extends Handler {
    async prepare() {
        this.checkPerm(PERM.PERM_CREATE_PROBLEM);
    }

    async get() {
        this.response.template = 'problem_import.html';
        this.response.body = {
            path: [
                ['Hydro', 'homepage'],
                ['problem_main', 'problem_main'],
                ['problem_import', null],
            ],
        };
    }

    @param('url', Types.String)
    @param('pid', Types.String, isPid)
    @param('hidden', Types.Boolean)
    @param('remoteType', Types.String)
    async post(domainId: string, url: string, pid: string, hidden = false, remoteType: string) {
        if (typeof global.Hydro.lib[`import.${remoteType}`] !== 'function') {
            throw new ValidationError('remoteType');
        }
        const [pdoc, testdata] = await global.Hydro.lib[`import.${remoteType}`](url, this);
        if (hidden) pdoc.hidden = true;
        const docId = await problem.add(
            domainId, pid || pdoc.pid, pdoc.title, pdoc.content, this.user._id,
            pdoc.tag || [], pdoc.category || [], null, pdoc.hidden,
        );
        if (testdata) {
            const file = path.resolve(os.tmpdir(), 'hydro', `import_${domainId}_${pid || pdoc.pid || docId}.zip`);
            const w = fs.createWriteStream(file);
            await new Promise((resolve, reject) => {
                w.on('finish', resolve);
                w.on('error', reject);
                testdata.pipe(w);
            });
            await problem.setTestdata(domainId, docId, file);
        }
        this.response.body = { pid: pid || docId };
        this.response.redirect = this.url('problem_settings', { pid: pid || docId });
    }
}

export async function apply() {
    Route('problem_import', '/problem/import', ProblemImportHandler);
}

global.Hydro.handler.import = apply;
