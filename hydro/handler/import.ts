import fs from 'fs';
import path from 'path';
import os from 'os';
import { ValidationError } from '../error'
import * as problem from '../model/problem';
import { PERM } from '../model/builtin';
import { Route, Handler } from '../service/server'

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

    async post({
        domainId, url, pid, hidden, remoteType,
    }) {
        if (typeof global.Hydro.lib[`import.${remoteType}`] !== 'function') {
            throw new ValidationError('remoteType');
        }
        const [pdoc, testdata] = await global.Hydro.lib[`import.${remoteType}`](url, this);
        if (pid) pdoc.pid = pid;
        if (hidden) pdoc.hidden = true;
        const docId = await problem.add(domainId, pdoc.title, pdoc.content, this.user._id, pdoc);
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
