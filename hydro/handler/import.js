
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
        url, pid, hidden, remoteType,
    }) {
        if (remoteType !== 'syzoj') throw new ValidationError('remoteType');
        const [pdoc, testdata] = await this.syzoj(url);
        if (pid) pdoc.pid = pid;
        if (hidden) pdoc.hidden = true;
        const _id = await problem.add(pdoc);
        console.log(_id);
        await problem.setTestdata(_id, testdata);
        this.response.body = { pid: pid || _id };
        this.response.redirect = `/p/${pid || _id}/settings`;
    }
}

async function apply() {
    Route('/problem/import', module.exports.ProblemImportHandler);
}

global.Hydro['handler.import'] = module.exports = {
    ProblemImportHandler, apply,
};
