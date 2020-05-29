const problem = require('../model/problem');
const { Route, Handler } = require('../service/server');
const { PERM_CREATE_PROBLEM } = require('../permission');
const { ValidationError } = require('../error');

class ProblemImportHandler extends Handler {
    async prepare() {
        this.checkPerm(PERM_CREATE_PROBLEM);
    }

    async get() {
        this.response.template = 'problem_import.html';
        this.response.body = {
            path: [
                ['Hydro', '/'],
                ['problem_main', '/p'],
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
        await problem.setTestdata(docId, testdata);
        this.response.body = { pid: pid || docId };
        this.response.redirect = `/p/${pid || docId}/settings`;
    }
}

async function apply() {
    Route('/problem/import', module.exports.ProblemImportHandler);
}

global.Hydro.handler.import = module.exports = {
    ProblemImportHandler, apply,
};
