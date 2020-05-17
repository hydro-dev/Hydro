const fs = require('fs');
const paginate = require('../lib/paginate');
const validator = require('../lib/validator');
const problem = require('../model/problem');
const record = require('../model/record');
const user = require('../model/user');
const solution = require('../model/solution');
const system = require('../model/system');
const bus = require('../service/bus');
const {
    Route, Connection, Handler, ConnectionHandler,
} = require('../service/server');
const gridfs = require('../service/gridfs');
const {
    NoProblemError, ProblemDataNotFoundError, BadRequestError,
    SolutionNotFoundError,
} = require('../error');
const {
    PERM_VIEW_PROBLEM, PERM_VIEW_PROBLEM_HIDDEN, PERM_SUBMIT_PROBLEM,
    PERM_CREATE_PROBLEM, PERM_READ_PROBLEM_DATA, PERM_EDIT_PROBLEM,
    PERM_JUDGE, PERM_VIEW_PROBLEM_SOLUTION, PERM_CREATE_PROBLEM_SOLUTION,
    PERM_EDIT_PROBLEM_SOLUTION, PERM_DELETE_PROBLEM_SOLUTION, PERM_EDIT_PROBLEM_SOLUTION_REPLY,
    PERM_REPLY_PROBLEM_SOLUTION, PERM_LOGGEDIN,
} = require('../permission');

class ProblemHandler extends Handler {
    async _prepare() {
        this.checkPerm(PERM_VIEW_PROBLEM);
    }

    async get({ page = 1, category = '' }) {
        this.response.template = 'problem_main.html';
        const q = {};
        let psdict = {};
        if (category) q.category = category;
        if (!this.user.hasPerm(PERM_VIEW_PROBLEM_HIDDEN)) q.hidden = false;
        const [pdocs, ppcount, pcount] = await paginate(
            problem.getMulti(q).sort({ pid: 1 }),
            page,
            await system.get('PROBLEM_PER_PAGE'),
        );
        if (this.user.hasPerm(PERM_LOGGEDIN)) {
            psdict = await problem.getListStatus(this.user._id, pdocs.map((pdoc) => pdoc._id));
        }
        const path = [
            ['Hydro', '/'],
            ['problem_main', null],
        ];
        this.response.body = {
            path, page, pcount, ppcount, pdocs, psdict, category,
        };
    }
}

class ProblemRandomHandler extends ProblemHandler {
    async get() {
        const q = {};
        if (!this.user.hasPerm(PERM_VIEW_PROBLEM_HIDDEN)) q.hidden = false;
        const pid = await problem.random(q);
        if (!pid) throw new NoProblemError();
        this.response.body = { pid };
    }
}

class ProblemDetailHandler extends ProblemHandler {
    async _prepare({ pid }) {
        this.response.template = 'problem_detail.html';
        this.uid = this.user._id;
        this.pid = pid;
        if (pid) this.pdoc = await problem.get(pid, this.uid);
        if (this.pdoc.hidden && this.pdoc.owner !== this.uid) {
            this.checkPerm(PERM_VIEW_PROBLEM_HIDDEN);
        }
        if (this.pdoc) this.udoc = await user.getById(this.pdoc.owner);
        this.response.body = {
            pdoc: this.pdoc,
            udoc: this.udoc,
            title: (this.pdoc || {}).title || '',
        };
    }

    async get() {
        this.response.body.path = [
            ['Hydro', '/'],
            ['problem_main', '/p'],
            [this.pdoc.title, null, true],
        ];
    }
}

class ProblemSubmitHandler extends ProblemDetailHandler {
    async prepare() {
        this.checkPerm(PERM_SUBMIT_PROBLEM);
    }

    async get() {
        this.response.template = 'problem_submit.html';
        const rdocs = await record.getUserInProblemMulti(this.uid, this.pdoc._id)
            .sort({ _id: -1 })
            .limit(10)
            .toArray();
        this.response.body = {
            path: [
                ['Hydro', '/'],
                ['problem_main', '/p'],
                [this.pdoc.title, `/p/${this.pid}`, true],
                ['problem_submit', null],
            ],
            pdoc: this.pdoc,
            udoc: this.udoc,
            rdocs,
            title: this.pdoc.title,
        };
    }

    async post() {
        const { lang, code } = this.request.body;
        const rid = await record.add({
            uid: this.uid, lang, code, pid: this.pdoc._id,
        });
        await Promise.all([
            record.judge(rid),
            user.inc(this.user._id, 'nSubmit'),
        ]);
        this.response.body = { rid };
        this.response.redirect = `/r/${rid}`;
    }
}

class ProblemPretestHandler extends ProblemDetailHandler {
    async post({ lang, code, input }) {
        this.limitRate('add_record', 60, 100);
        const rid = await record.add({
            uid: this.uid, lang, code, pid: this.pdoc._id, input,
        });
        await record.judge(rid);
        this.response.body = { rid };
    }
}

class ProblemPretestConnectionHandler extends ConnectionHandler {
    async prepare({ pid }) {
        this.pid = pid.toString();
        bus.subscribe(['record_change'], this.onRecordChange);
    }

    async onRecordChange(data) {
        const rdoc = data.value;
        if (rdoc.uid !== this.user._id || rdoc.pid.toString() !== this.pid) return;
        if (rdoc.tid) return;
        this.send({ rdoc });
    }

    async cleanup() {
        bus.unsubscribe(['record_change'], this.onRecordChange);
    }
}

class ProblemStatisticsHandler extends ProblemDetailHandler {
    async get() {
        const udoc = await user.getById(this.pdoc.owner);
        const path = [
            ['problem_main', '/p'],
            [this.pdoc.title, `/p/${this.pdoc.pid}`, true],
            ['problem_statistics', null],
        ];
        this.response.template = 'problem_statistics.html';
        this.response.body = { pdoc: this.pdoc, udoc, path };
    }
}

class ProblemManageHandler extends ProblemDetailHandler {
    async prepare() {
        if (this.pdoc.owner !== this.uid) this.checkPerm(PERM_EDIT_PROBLEM);
    }
}

class ProblemSettingsHandler extends ProblemManageHandler {
    async get() {
        this.response.template = 'problem_settings.html';
        this.response.body.path = [
            ['Hydro', '/'],
            ['problem_main', '/p'],
            [this.pdoc.title, `/p/${this.pid}`, true],
            ['problem_settings', null],
        ];
    }

    async post() {
        // TODO(masnn)
        this.back();
    }
}

class ProblemEditHandler extends ProblemManageHandler {
    async get({ pid }) {
        this.response.template = 'problem_edit.html';
        this.response.body.path = [
            ['Hydro', '/'],
            ['problem_main', '/p'],
            [this.pdoc.title, `/p/${pid}`, true],
            ['problem_edit', null],
        ];
        this.response.body.page_name = 'problem_edit';
    }

    async post({ title, content }) {
        const pid = validator.checkPid(this.request.body.pid);
        const pdoc = await problem.get(this.params.pid);
        await problem.edit(pdoc._id, { title, content, pid });
        this.response.redirect = `/p/${pid}`;
    }
}

class ProblemDataUploadHandler extends ProblemManageHandler {
    async prepare() {
        this.response.template = 'problem_upload.html';
    }

    async get() {
        if (this.pdoc.data && typeof this.pdoc.data === 'object') {
            const files = await gridfs.find({ _id: this.pdoc.data }).toArray();
            this.md5 = files[0].md5;
        }
        this.response.body.md5 = this.md5;
    }

    async post() {
        if (!this.request.files.file) throw new BadRequestError();
        const r = fs.createReadStream(this.request.files.file.path);
        await problem.setTestdata(this.pdoc._id, r);
        if (this.pdoc.data && typeof this.pdoc.data === 'object') {
            const files = await gridfs.find({ _id: this.pdoc.data }).toArray();
            this.md5 = files[0].md5;
        }
        this.response.body.md5 = this.md5;
    }
}

class ProblemDataDownloadHandler extends ProblemDetailHandler {
    async get({ pid }) {
        if (this.uid !== this.pdoc.owner) this.checkPerm([PERM_READ_PROBLEM_DATA, PERM_JUDGE]);
        if (!this.pdoc.data) throw new ProblemDataNotFoundError(pid);
        else if (typeof this.pdoc.data === 'string') [, this.ctx.setRedirect] = this.pdoc.data.split('from:');
        this.response.attachment(`${this.pdoc.title}.zip`);
        this.response.body = gridfs.openDownloadStream(this.pdoc.data);
    }
}

class ProblemSolutionHandler extends ProblemDetailHandler {
    async get({ page = 1 }) {
        this.response.template = 'problem_solution.html';
        this.checkPerm(PERM_VIEW_PROBLEM_SOLUTION);
        const [psdocs, pcount, pscount] = await paginate(
            solution.getMulti(this.pdoc._id),
            page,
            await system.get('SOLUTION_PER_PAGE'),
        );
        const uids = [this.pdoc.owner]; const
            docids = [];
        for (const psdoc of psdocs) {
            docids.push(psdoc._id);
            uids.push(psdoc.owner);
            if (psdoc.reply.length) { for (const psrdoc of psdoc.reply) uids.push(psrdoc.owner); }
        }
        const udict = await user.getList(uids);
        const pssdict = solution.getListStatus(docids, this.uid);
        const path = [
            ['problem_main', '/p'],
            [this.pdoc.title, `/p/${this.pdoc.pid}`, true],
            ['problem_solution', null],
        ];
        this.response.body = {
            path, psdocs, page, pcount, pscount, udict, pssdict, pdoc: this.pdoc,
        };
    }

    async post({ psid }) {
        if (psid) this.psdoc = await solution.get(psid);
    }

    async postSubmit({ content }) {
        this.checkPerm(PERM_CREATE_PROBLEM_SOLUTION);
        await solution.add(this.pdoc._id, this.uid, content);
        this.back();
    }

    async postEditSolution({ content }) {
        if (this.psdoc.owner !== this.uid) this.checkPerm(PERM_EDIT_PROBLEM_SOLUTION);
        this.psdoc = await solution.edit(this.psdoc._id, content);
        this.ctx.body.psdoc = this.psdoc;
        this.back();
    }

    async postDeleteSolution() {
        if (this.psdoc.owner !== this.uid) this.checkPerm(PERM_DELETE_PROBLEM_SOLUTION);
        await solution.del(this.psdoc._id);
        this.back();
    }

    async postReply({ psid, content }) {
        this.checkPerm(PERM_REPLY_PROBLEM_SOLUTION);
        const psdoc = await solution.get(psid);
        await solution.reply(psdoc._id, this.uid, content);
    }

    async postEditReply({ content, psid, psrid }) {
        const [psdoc, psrdoc] = await solution.getReply(psid, psrid);
        if ((!psdoc) || psdoc.pid !== this.pdoc._id) throw new SolutionNotFoundError(psid);
        if (psrdoc.owner !== this.uid) this.checkPerm(PERM_EDIT_PROBLEM_SOLUTION_REPLY);
        await solution.editReply(psid, psrid, content);
    }

    async postDeleteReply({ psid, psrid }) {
        const [psdoc, psrdoc] = await solution.getReply(psid, psrid);
        if ((!psdoc) || psdoc.pid !== this.pdoc._id) throw new SolutionNotFoundError(psid);
        if (psrdoc.owner !== this.uid) this.checkPerm(PERM_EDIT_PROBLEM_SOLUTION_REPLY);
        await solution.delReply(psid, psrid);
        this.back();
    }

    async postUpvote() {
        const [psdoc, pssdoc] = await solution.vote(this.psdoc._id, this.uid, 1);
        this.response.body = { vote: psdoc.vote, user_vote: pssdoc.vote };
        if (!this.preferJson) this.back();
    }

    async postDownvote() {
        const [psdoc, pssdoc] = await solution.vote(this.psdoc._id, this.uid, -1);
        this.response.body = { vote: psdoc.vote, user_vote: pssdoc.vote };
        if (!this.preferJson) this.back();
    }
}

class ProblemSolutionRawHandler extends ProblemDetailHandler {
    async get({ psid }) {
        this.checkPerm(PERM_VIEW_PROBLEM_SOLUTION);
        const psdoc = await solution.get(psid);
        this.response.type = 'text/markdown';
        this.response.body = psdoc.content;
    }
}

class ProblemSolutionReplyRawHandler extends ProblemDetailHandler {
    async get({ psid }) {
        this.checkPerm(PERM_VIEW_PROBLEM_SOLUTION);
        const [psdoc, psrdoc] = await solution.getReply(psid);
        if ((!psdoc) || psdoc.pid !== this.pdoc._id) throw new SolutionNotFoundError(psid);
        this.response.type = 'text/markdown';
        this.response.body = psrdoc.content;
    }
}

class ProblemCreateHandler extends Handler {
    async get() {
        this.response.template = 'problem_edit.html';
        this.checkPerm(PERM_CREATE_PROBLEM);
        this.response.body = {
            path: [
                ['Hydro', '/'],
                ['problem_main', '/p'],
                ['problem_create', null],
            ],
            page_name: 'problem_create',
        };
    }

    async post({
        title, pid, content, hidden,
    }) {
        validator.checkPid(pid);
        pid = pid || await system.inc('pid');
        await problem.add({
            title, content, owner: this.user._id, pid, hidden,
        });
        this.response.body = { pid };
        this.response.redirect = `/p/${pid}/settings`;
    }
}

async function apply() {
    Route('/p', module.exports.ProblemHandler);
    Route('/problem/random', module.exports.ProblemRandomHandler);
    Route('/p/:pid', module.exports.ProblemDetailHandler);
    Route('/p/:pid/submit', module.exports.ProblemSubmitHandler);
    Route('/p/:pid/pretest', module.exports.ProblemPretestHandler);
    Route('/p/:pid/settings', module.exports.ProblemSettingsHandler);
    Route('/p/:pid/statistics', module.exports.ProblemStatisticsHandler);
    Route('/p/:pid/edit', module.exports.ProblemEditHandler);
    Route('/p/:pid/upload', module.exports.ProblemDataUploadHandler);
    Route('/p/:pid/data', module.exports.ProblemDataDownloadHandler);
    Route('/p/:pid/solution', module.exports.ProblemSolutionHandler);
    Route('/p/:pid/solution/:psid/raw', module.exports.ProblemSolutionRawHandler);
    Route('/p/:pid/solution/:psid/:psrid/raw', module.exports.ProblemSolutionReplyRawHandler);
    Route('/problem/create', module.exports.ProblemCreateHandler);
    Connection('/p/:pid/pretest-conn', module.exports.ProblemPretestConnectionHandler);
}

global.Hydro.handler.problem = module.exports = {
    ProblemHandler,
    ProblemRandomHandler,
    ProblemDetailHandler,
    ProblemSubmitHandler,
    ProblemPretestHandler,
    ProblemSettingsHandler,
    ProblemStatisticsHandler,
    ProblemEditHandler,
    ProblemDataUploadHandler,
    ProblemDataDownloadHandler,
    ProblemSolutionHandler,
    ProblemSolutionRawHandler,
    ProblemSolutionReplyRawHandler,
    ProblemCreateHandler,
    ProblemPretestConnectionHandler,
    apply,
};
