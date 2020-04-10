const
    fs = require('fs'),
    paginate = require('../lib/paginate'),
    validator = require('../lib/validator'),
    problem = require('../model/problem'),
    record = require('../model/record'),
    user = require('../model/user'),
    solution = require('../model/solution'),
    system = require('../model/system'),
    { ROUTE } = require('../service/server'),
    gridfs = require('../service/gridfs'),
    queue = require('../service/queue'),
    { NoProblemError, ProblemDataNotFoundError, BadRequestError } = require('../error'),
    { constants } = require('../options'),
    {
        PERM_VIEW_PROBLEM,
        PERM_VIEW_PROBLEM_HIDDEN,
        PERM_SUBMIT_PROBLEM,
        PERM_CREATE_PROBLEM,
        PERM_READ_PROBLEM_DATA,
        PERM_EDIT_PROBLEM,
        PERM_JUDGE,
        PERM_VIEW_PROBLEM_SOLUTION,
        PERM_CREATE_PROBLEM_SOLUTION,
        PERM_EDIT_PROBLEM_SOLUTION,
        PERM_DELETE_PROBLEM_SOLUTION,
        PERM_EDIT_PROBLEM_SOLUTION_REPLY,
        PERM_REPLY_PROBLEM_SOLUTION
    } = require('../permission');

queue.assert('judge');

class ProblemHandler {
    constructor(ctx) {
        this.ctx = ctx;
        this.ctx.templateName = 'problem_main.html';
        this.ctx.checkPerm(PERM_VIEW_PROBLEM);
    }
    async get({ page = 1, category = null }) {
        let q = {};
        if (category) q.category = category;
        if (!this.ctx.state.user.hasPerm(PERM_VIEW_PROBLEM_HIDDEN)) q.hidden = false;
        let pdocs = await problem.getMany(q, { pid: 1 }, page, constants.PROBLEM_PER_PAGE);
        this.ctx.body = {
            path: [
                ['Hydro', '/'],
                ['problem_main', null]
            ],
            page, pdocs, category: ''
        };
    }
}

class ProblemRandomHandler extends ProblemHandler {
    constructor(ctx) {
        super(ctx);
    }
    async get() {
        let q = {};
        if (!this.ctx.state.user.hasPerm(PERM_VIEW_PROBLEM_HIDDEN)) q.hidden = false;
        let pid = await problem.random(q);
        if (!pid) throw new NoProblemError();
        this.ctx.body = { pid };
    }
}

class ProblemDetailHandler extends ProblemHandler {
    constructor(ctx) {
        super(ctx);
        this.uid = ctx.state.user._id;
        this.pid = ctx.params.pid;
        this.ctx.templateName = 'problem_detail.html';
    }
    async _prepare() {
        if (this.pid) this.pdoc = await problem.get(this);
        if (this.pdoc.hidden && this.pdoc.owner != this.uid) this.ctx.checkPerm(PERM_VIEW_PROBLEM_HIDDEN);
        if (this.pdoc) this.udoc = await user.getById(this.pdoc.owner);
        this.ctx.body = {
            pdoc: this.pdoc,
            udoc: this.udoc,
            title: (this.pdoc || {}).title || ''
        };
    }
    async get() {
        this.ctx.body.path = [
            ['Hydro', '/'],
            ['problem_main', '/p'],
            [this.pdoc.title, null, true]
        ];
    }
}

class ProblemSubmitHandler extends ProblemDetailHandler {
    constructor(ctx) {
        super(ctx);
        this.ctx.templateName = 'problem_submit.html';
        this.ctx.checkPerm(PERM_SUBMIT_PROBLEM);
    }
    async get() {
        let rdocs = await record.getUserInProblemMulti(this.uid, this.pdoc._id).sort({ _id: -1 }).limit(10).toArray();
        this.ctx.body = {
            path: [
                ['Hydro', '/'],
                ['problem_main', '/p'],
                [this.pdoc.title, `/p/${this.pid}`, true],
                ['problem_submit', null]
            ],
            pdoc: this.pdoc,
            udoc: this.udoc,
            rdocs,
            title: this.pdoc.title
        };
    }
    async post() {
        let { lang, code } = this.ctx.request.body;
        let rid = await record.add({
            uid: this.uid, lang, code, pid: this.pdoc._id
        });
        await queue.push('judge', rid);
        this.ctx.state.user.nSubmit++;
        this.ctx.body = { rid };
        this.ctx.setRedirect = `/r/${rid}`;
    }
}

class ProblemSettingsHandler extends ProblemDetailHandler {
    constructor(ctx) {
        super(ctx);
        this.ctx.templateName = 'problem_settings.html';
    }
    async prepare() {
        if (this.pdoc.owner != this.uid) this.ctx.checkPerm(PERM_EDIT_PROBLEM);
    }
    async get() {
        this.ctx.body.path = [
            ['Hydro', '/'],
            ['problem_main', '/p'],
            [this.pdoc.title, `/p/${this.pid}`, true],
            ['problem_settings', null]
        ];
    }
    async post() {
        // TODO(masnn)
        this.ctx.back();
    }
}

class ProblemEditHandler extends ProblemDetailHandler {
    constructor(ctx) {
        super(ctx);
        this.ctx.templateName = 'problem_edit.html';
    }
    async prepare() {
        if (this.pdoc.owner != this.uid) this.ctx.checkPerm(PERM_EDIT_PROBLEM);
    }
    async get() {
        this.ctx.body.path = [
            ['Hydro', '/'],
            ['problem_main', '/p'],
            [this.pdoc.title, `/p/${this.ctx.params.pid}`, true],
            ['problem_edit', null]
        ];
        this.ctx.page_name = 'problem_edit';
    }
    async post() {
        let title = validator.checkTitle(this.ctx.request.body.title);
        let content = validator.checkContent(this.ctx.request.body.content);
        let pid = validator.checkPid(this.ctx.request.body.pid);
        let pdoc = await problem.get({ pid: this.ctx.params.pid });
        await problem.edit(pdoc._id, {
            title, content, pid
        });
        this.ctx.setRedirect = `/p/${pid}`;
    }
}

class ProblemDataUploadHandler extends ProblemDetailHandler {
    constructor(ctx) {
        super(ctx);
        this.ctx.templateName = 'problem_upload.html';
    }
    async prepare() {
        if (this.pdoc.owner != this.uid) this.ctx.checkPerm(PERM_EDIT_PROBLEM);
        if (this.pdoc.data && typeof this.pdoc.data == 'object') {
            let files = await gridfs.find({ _id: this.pdoc.data }).toArray();
            this.md5 = files[0].md5;
        }
    }
    async get() {
        this.ctx.body.md5 = this.md5;
    }
    async post() {
        if (!this.ctx.request.files.file) throw new BadRequestError();
        const r = fs.createReadStream(this.ctx.request.files.file.path);
        let f = gridfs.openUploadStream('data.zip');
        await new Promise((resolve, reject) => {
            r.pipe(f);
            f.once('finish', resolve);
            f.once('error', reject);
        });
        if (this.pdoc.data && typeof this.pdoc.data == 'object')
            gridfs.delete(this.pdoc.data);
        this.pdoc = await problem.edit(this.pdoc._id, { data: f.id });
        if (this.pdoc.data && typeof this.pdoc.data == 'object') {
            let files = await gridfs.find({ _id: this.pdoc.data }).toArray();
            this.md5 = files[0].md5;
        }
        this.ctx.body.md5 = this.md5;
    }
}

class ProblemDataDownloadHandler extends ProblemDetailHandler {
    constructor(ctx) {
        super(ctx);
    }
    async get({ pid }) {
        if (this.uid != this.pdoc.owner) this.ctx.checkPerm([PERM_READ_PROBLEM_DATA, PERM_JUDGE]);
        if (!this.pdoc.data) throw new ProblemDataNotFoundError(pid);
        else if (typeof this.pdoc.data == 'string') this.ctx.setRedirect = this.pdoc.data.split('from:')[1];
        this.ctx.attachment(`${this.pdoc.title}.zip`);
        this.ctx.body = gridfs.openDownloadStream(this.pdoc.data);
    }
}

class ProblemSolutionHandler extends ProblemDetailHandler {
    constructor(ctx) {
        super(ctx);
        ctx.templateName = 'problem_solution.html';
    }
    async get() {
        let page = this.ctx.query.page || 1;
        this.ctx.checkPerm(PERM_VIEW_PROBLEM_SOLUTION);
        let [psdocs, pcount, pscount] = await paginate(solution.getMulti(this.pdoc._id), page, constants.SOLUTION_PER_PAGE);
        let uids = [this.pdoc.owner], docids = [];
        for (let psdoc of psdocs) {
            docids.push(psdoc._id);
            uids.push(psdoc.owner);
            if (psdoc.reply.length) {
                for (let psrdoc of psdoc.reply) {
                    uids.push(psrdoc.owner);
                }
            }
        }
        let udict = await user.getList(uids);
        this.ctx.body.path = [
            ['problem_main', '/p'],
            [this.pdoc.title, `/p/${this.pdoc.pid}`, true],
            ['problem_solution', null]
        ];
        this.ctx.body = Object.assign(this.ctx.body, {
            psdocs, page, pcount, pscount, udict
        });
    }
    async post({ psid }) {
        if (psid) this.psdoc = await solution.get(psid);
    }
    async post_submit({ content }) {
        this.ctx.checkPerm(PERM_CREATE_PROBLEM_SOLUTION);
        await solution.add(this.pdoc._id, this.uid, content);
        this.ctx.back();
    }
    async post_edit_solution({ content }) {
        if (this.psdoc.owner != this.uid) this.ctx.checkPerm(PERM_EDIT_PROBLEM_SOLUTION);
        this.psdoc = await solution.edit(this.psdoc._id, content);
        this.ctx.body.psdoc = this.psdoc;
        this.ctx.back();
    }
    async post_delete_solution() {
        if (this.psdoc.owner != this.uid) this.ctx.checkPerm(PERM_DELETE_PROBLEM_SOLUTION);
        await solution.del(this.psdoc._id);
        this.ctx.back();
    }
    async post_reply({ psid, content }) {
        this.ctx.checkPerm(PERM_REPLY_PROBLEM_SOLUTION);
        let psdoc = await solution.get(psid);
        await solution.reply(psdoc._id, this.uid, content);
    }
    async post_edit_reply({ content }) {
        let { psid, psrid } = this.ctx.request.body;
        let [psdoc, psrdoc] = await solution.getReply(psid, psrid);
        if ((!psdoc) || psdoc.pid != this.pdoc._id) throw new SolutionNotFoundError(psid);
        if (psrdoc.owner != this.uid) this.ctx.checkPerm(PERM_EDIT_PROBLEM_SOLUTION_REPLY);
        await solution.editReply(psid, psrid, content);
    }
    async post_delete_reply({ psid, psrid }) {
        let [psdoc, psrdoc] = await solution.getReply(psid, psrid);
        if ((!psdoc) || psdoc.pid != this.pdoc._id) throw new SolutionNotFoundError(psid);
        if (psrdoc.owner != this.uid) this.ctx.checkPerm(PERM_EDIT_PROBLEM_SOLUTION_REPLY);
        await solution.delReply(psid, psrid);
        this.ctx.back();
    }
}

class ProblemSolutionRawHandler extends ProblemDetailHandler {
    constructor(ctx) {
        super(ctx);
        ctx.checkPerm(PERM_VIEW_PROBLEM_SOLUTION);
    }
    async get({ psid }) {
        let psdoc = await solution.get(psid);
        this.ctx.response.type = 'text/markdown';
        this.ctx.body = psdoc.content;
    }
}

class ProblemSolutionReplyRawHandler extends ProblemDetailHandler {
    constructor(ctx) {
        super(ctx);
        ctx.checkPerm(PERM_VIEW_PROBLEM_SOLUTION);
    }
    async get({ psid }) {
        let [psdoc, psrdoc] = await solution.getReply(psid);
        if ((!psdoc) || psdoc.pid != this.pdoc._id) throw new SolutionNotFoundError(psid);
        this.ctx.response.type = 'text/markdown';
        this.ctx.body = psrdoc.content;
    }
}

class ProblemCreateHandler {
    constructor(ctx) {
        this.ctx = ctx;
        this.ctx.templateName = 'problem_edit.html';
        this.ctx.checkPerm(PERM_CREATE_PROBLEM);
    }
    async get() {
        this.ctx.body = {
            path: [
                ['Hydro', '/'],
                ['problem_main', '/p'],
                ['problem_create', null]
            ], page_name: 'problem_create'
        };
    }
    async post() {
        let { title, pid, content, hidden } = this.ctx.request.body;
        validator.checkPid(pid);
        pid = pid || await system.incPidCounter();
        await problem.add({ title, content, owner: this.ctx.state.user._id, pid, hidden });
        this.ctx.body = { pid };
        this.ctx.setRedirect = `/p/${pid}/settings`;
    }
}

ROUTE('/p', ProblemHandler);
ROUTE('/problem/random', ProblemRandomHandler);
ROUTE('/p/:pid', ProblemDetailHandler);
ROUTE('/p/:pid/submit', ProblemSubmitHandler);
ROUTE('/p/:pid/settings', ProblemSettingsHandler);
ROUTE('/p/:pid/edit', ProblemEditHandler);
ROUTE('/p/:pid/upload', ProblemDataUploadHandler);
ROUTE('/p/:pid/data', ProblemDataDownloadHandler);
ROUTE('/p/:pid/solution', ProblemSolutionHandler);
ROUTE('/p/:pid/solution/:psid/raw', ProblemSolutionRawHandler);
ROUTE('/p/:pid/solution/:psid/:psrid/raw', ProblemSolutionReplyRawHandler);
ROUTE('/problem/create', ProblemCreateHandler);


/*

@app.route('/p/{pid}/pretest', 'problem_pretest')
class ProblemPretestHandler(base.Handler):
  @base.requirePerm(builtin.PERM_SUBMIT_PROBLEM)
  @base.route_argument
  @base.post_argument
  @base.require_csrf_token
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
  @base.require_csrf_token
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