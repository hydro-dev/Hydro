const fs = require('fs');
const path = require('path');
const os = require('os');
const problem = require('../model/problem');
const { PERM_CREATE_PROBLEM } = require('../model/builtin').PERM;
const { Route, Handler } = require('../service/server');
const { ValidationError } = require('../error');

class ProblemImportHandler extends Handler {
    async prepare() {
        this.checkPerm(PERM_CREATE_PROBLEM);
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

async function apply() {
    Route('problem_import', '/problem/import', ProblemImportHandler);
}

global.Hydro.handler.import = module.exports = apply;
