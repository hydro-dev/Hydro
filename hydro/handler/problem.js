const fs = require('fs');
const paginate = require('../lib/paginate');
const validator = require('../lib/validator');
const problem = require('../model/problem');
const record = require('../model/record');
const user = require('../model/user');
const solution = require('../model/solution');
const system = require('../model/system');
const { Route, Handler } = require('../service/server');
const gridfs = require('../service/gridfs');
const queue = require('../service/queue');
const {
    NoProblemError, ProblemDataNotFoundError, BadRequestError,
    SolutionNotFoundError,
} = require('../error');
const { constants } = require('../options');
const {
    PERM_VIEW_PROBLEM, PERM_VIEW_PROBLEM_HIDDEN, PERM_SUBMIT_PROBLEM,
    PERM_CREATE_PROBLEM, PERM_READ_PROBLEM_DATA, PERM_EDIT_PROBLEM,
    PERM_JUDGE, PERM_VIEW_PROBLEM_SOLUTION, PERM_CREATE_PROBLEM_SOLUTION,
    PERM_EDIT_PROBLEM_SOLUTION, PERM_DELETE_PROBLEM_SOLUTION, PERM_EDIT_PROBLEM_SOLUTION_REPLY,
    PERM_REPLY_PROBLEM_SOLUTION,
} = require('../permission');

queue.assert('judge');

class ProblemHandler extends Handler {
    async _prepare() {
        this.checkPerm(PERM_VIEW_PROBLEM);
    }

    async get({ page = 1, category = null }) {
        this.response.template = 'problem_main.html';
        const q = {};
        if (category) q.category = category;
        if (!this.user.hasPerm(PERM_VIEW_PROBLEM_HIDDEN)) q.hidden = false;
        const pdocs = await problem.getMany(q, { pid: 1 }, page, constants.PROBLEM_PER_PAGE);
        this.response.body = {
            path: [
                ['Hydro', '/'],
                ['problem_main', null],
            ],
            page,
            pdocs,
            category: '',
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
        if (this.pdoc.hidden && this.pdoc.owner !== this.uid) this.checkPerm(PERM_VIEW_PROBLEM_HIDDEN);
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
        await queue.push('judge', rid);
        this.user.nSubmit++;
        this.response.body = { rid };
        this.response.redirect = `/r/${rid}`;
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
            page, constants.SOLUTION_PER_PAGE,
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
            path, psdocs, page, pcount, pscount, udict, pssdict,
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
        pid = pid || await system.incPidCounter();
        await problem.add({
            title, content, owner: this.user._id, pid, hidden,
        });
        this.response.body = { pid };
        this.response.redirect = `/p/${pid}/settings`;
    }
}

Route('/p', ProblemHandler);
Route('/problem/random', ProblemRandomHandler);
Route('/p/:pid', ProblemDetailHandler);
Route('/p/:pid/submit', ProblemSubmitHandler);
Route('/p/:pid/settings', ProblemSettingsHandler);
Route('/p/:pid/edit', ProblemEditHandler);
Route('/p/:pid/upload', ProblemDataUploadHandler);
Route('/p/:pid/data', ProblemDataDownloadHandler);
Route('/p/:pid/solution', ProblemSolutionHandler);
Route('/p/:pid/solution/:psid/raw', ProblemSolutionRawHandler);
Route('/p/:pid/solution/:psid/:psrid/raw', ProblemSolutionReplyRawHandler);
Route('/problem/create', ProblemCreateHandler);


/*

@app.route('/p/{pid}/pretest', 'problem_pretest')
class ProblemPretestHandler(base.Handler):
  @base.requirePerm(builtin.PERM_SUBMIT_PROBLEM)
  @base.route_argument
  @base.post_argument
  @base.require_csrfToken
  @base.sanitize
  @base.limitRate('add_record', 60, 100)
  async def post(self, *, pid: document.convert_doc_id, lang: str, code: str,
                 data_input: str, data_output: str):
    pdoc = await problem.get(self.domainId, pid)
    # don't need to check hidden status
    # create zip file, TODO(twd2): check file size
    post = await self.request.post()
    content = list(zip(post.getall('data_input'), post.getall('data_output')))
    output_buffer = io.BytesIO()
    zip_file = zipfile.ZipFile(output_buffer, 'a', zipfile.ZIP_DEFLATED)
    config_content = str(len(content)) + '\n'
    for i, (data_input, data_output) in enumerate(content):
      input_file = 'input{0}.txt'.format(i)
      output_file = 'output{0}.txt'.format(i)
      config_content += '{0}|{1}|1|10|262144\n'.format(input_file, output_file)
      zip_file.writestr('Input/{0}'.format(input_file), data_input)
      zip_file.writestr('Output/{0}'.format(output_file), data_output)
    zip_file.writestr('Config.ini', config_content)
    # mark all files as created in Windows :p
    for zfile in zip_file.filelist:
      zfile.create_system = 0
    zip_file.close()
    fid = await fs.add_data('application/zip', output_buffer.getvalue())
    output_buffer.close()
    rid = await record.add(self.domainId, pdoc['_id'], constant.record.TYPE_PRETEST,
                           self.user['_id'], lang, code, fid)
    self.json_or_redirect(self.reverse_url('record_detail', rid=rid))


@app.connection_route('/p/{pid}/pretest-conn', 'problem_pretest-conn')
class ProblemPretestConnection(record_handler.RecordVisibilityMixin, base.Connection):
  async def on_open(self):
    await super(ProblemPretestConnection, self).on_open()
    self.pid = document.convert_doc_id(self.request.match_info['pid'])
    bus.subscribe(self.on_record_change, ['record_change'])

  async def on_record_change(self, e):
    rdoc = e['value']
    if rdoc['uid'] != self.user['_id'] or \
       rdoc['domainId'] != self.domainId or rdoc['pid'] != self.pid:
      return
    # check permission for visibility: contest
    if rdoc['tid']:
      show_status, tdoc = await self.rdoc_contest_visible(rdoc)
      if not show_status:
        return
    self.send(rdoc=rdoc)

  async def on_close(self):
    bus.unsubscribe(self.on_record_change)


  @base.requirePriv(builtin.PRIV_USER_PROFILE)
  @base.route_argument
  @base.post_argument
  @base.require_csrfToken
  @base.sanitize
  async def post(self, *, pid: document.convert_doc_id, title: str, content: str):
    pdoc = await problem.get(self.domainId, pid)
    if not self.own(pdoc, builtin.PERM_EDIT_PROBLEM_SELF):
      self.check_perm(builtin.PERM_EDIT_PROBLEM)
    await problem.edit(self.domainId, pdoc['_id'], title=title, content=content)
    self.json_or_redirect(self.reverse_url('problem_detail', pid=pid))


@app.route('/p/{pid}/statistics', 'problem_statistics')
class ProblemStatisticsHandler(base.Handler):
  @base.route_argument
  @base.sanitize
  async def get(self, *, pid: document.convert_doc_id):
    # TODO(twd2)
    uid = self.user['_id'] if self.has_priv(builtin.PRIV_USER_PROFILE) else None
    pdoc = await problem.get(self.domainId, pid, uid)
    if pdoc.get('hidden', False):
      self.check_perm(builtin.PERM_VIEW_PROBLEM_HIDDEN)
    udoc, dudoc = await asyncio.gather(user.get_by_uid(pdoc['owner_uid']),
                                       domain.get_user(self.domainId, pdoc['owner_uid']))
    path_components = self.build_path(
        (self.translate('problem_main'), self.reverse_url('problem_main')),
        (pdoc['title'], self.reverse_url('problem_detail', pid=pdoc['_id'])),
        (self.translate('problem_statistics'), None))
    self.render('problem_statistics.html', pdoc=pdoc, udoc=udoc, dudoc=dudoc,
                page_title=pdoc['title'], path_components=path_components)

*/
