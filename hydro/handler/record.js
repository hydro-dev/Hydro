const
    bson = require('bson'),
    { constants } = require('../options'),
    { PERM_READ_RECORD_CODE, PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD,
        PERM_REJUDGE, PERM_VIEW_PROBLEM_HIDDEN } = require('../permission'),
    { requirePerm } = require('../handler/tools'),
    problem = require('../model/problem'),
    record = require('../model/record'),
    user = require('../model/user'),
    bus = require('../service/bus'),
    queue = require('../service/queue'),
    { GET, POST, SOCKET } = require('../service/server');

GET('/r', async ctx => {
    ctx.templateName = 'record_main.html';
    let q = {},
        page = ctx.query.page || 1;
    let rdocs = await record.getMany(q, { rid: 1 }, page, constants.RECORD_PER_PAGE);
    let pdict = {}, udict = {};
    for (let rdoc of rdocs) {
        udict[rdoc.uid] = await user.getById(rdoc.uid);
        pdict[rdoc.pid] = await problem.get({ pid: rdoc.pid, uid: ctx.state.user._id });
    }
    ctx.body = { page, rdocs, pdict, udict };
});
SOCKET('/record-conn', class RecordConnHandler {
    constructor(conn) {
        this.tid = null;
        this.h = async data => {
            let rdoc = data.value;
            if (rdoc.tid && rdoc.tid != this.tid.toString()) return;
            let [udoc, pdoc] = await Promise.all([user.getById(rdoc.uid), problem.get({ pid: rdoc.pid })]);
            if (pdoc.hidden && !conn.state.user.hasPerm(PERM_VIEW_PROBLEM_HIDDEN)) pdoc = null;
            conn.send({ html: await conn.renderHTML('record_main_tr.html', { rdoc, udoc, pdoc }) });
        };
    }
    onOpen() {
        bus.subscribe(['record_change'], this.h);
    }
    onMessage(data) {
        if (data.tid) this.tid = data.tid;
    }
    onClose() {
        bus.unsubscribe(['record_change'], this.h);
    }
});
GET('/r/:rid', async ctx => {
    ctx.templateName = 'record_detail.html';
    let uid = ctx.state.user._id, rid = new bson.ObjectID(ctx.params.rid);
    let rdoc = await record.get(rid);
    if (rdoc.hidden) ctx.checkPerm(PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD);
    if (rdoc.uid != uid && !ctx.state.user.hasPerm(PERM_READ_RECORD_CODE)) rdoc.code = null;
    ctx.body = { rdoc, show_status: true };
});
SOCKET('/record-detail-conn', class RecordDetailConnHandler {
    constructor(conn) {
        this.rid = conn.params.rid;
        this.h = async data => {
            let rdoc = data.value;
            if (rdoc.rid.toString() != this.rid) return;
            let [udoc, pdoc] = await Promise.all([user.getById(rdoc.uid), problem.get({ pid: rdoc.pid })]);
            if (pdoc.hidden && !conn.state.user.hasPerm(PERM_VIEW_PROBLEM_HIDDEN)) pdoc = null;
            conn.send({ html: await conn.renderHTML('record_main_tr.html', { rdoc, udoc, pdoc }) });
        };
    }
    async onOpen() {
        bus.subscribe(['record_change'], this.h);
    }
    onMessage(data) {
        if (data.rid) this.rid = data.rid;
    }
    onClose() {
        bus.unsubscribe(['record_change'], this.h);
    }
});
POST('/r/:rid/rejudge', requirePerm(PERM_REJUDGE), async ctx => {
    ctx.templateName = 'record_detail.html';
    let uid = ctx.state.user._id, rid = new bson.ObjectID(ctx.params.rid);
    let rdoc = await record.get(rid);
    if (rdoc.hidden) ctx.checkPerm(PERM_VIEW_CONTEST_HIDDEN_SCOREBOARD);
    if (rdoc.uid != uid && !ctx.state.user.hasPerm(PERM_READ_RECORD_CODE)) rdoc.code = null;
    if (rdoc) await queue.push('judge', rid);
    ctx.body = { rdoc, show_status: true };
});

/*

@app.route('/p/category/{category:[^/]*}/random', 'problem_category_random')
class ProblemCategoryRandomHandler(base.Handler):
  @base.requirePerm(builtin.PERM_VIEW_PROBLEM)
  @base.get_argument
  @base.route_argument
  @base.sanitize
  async def get(self, *, category: str):
    if not self.has_perm(builtin.PERM_VIEW_PROBLEM_HIDDEN):
      f = {'hidden': False}
    else:
      f = {}
    query = ProblemCategoryHandler.build_query(category)
    pid = await problem.get_random_id(self.domainId, **query, **f)
    if pid:
      self.json_or_redirect(self.reverse_url('problem_detail', pid=pid))
    else:
      self.json_or_redirect(self.referer_or_main)


@app.route('/p/{pid}/submit', 'problem_submit')
class ProblemSubmitHandler(base.Handler):
  @base.requirePerm(builtin.PERM_SUBMIT_PROBLEM)
  @base.route_argument
  @base.sanitize
  async def get(self, *, pid: document.convert_doc_id):
    # TODO(twd2): check status, eg. test, hidden problem, ...
    uid = self.user['_id'] if self.has_priv(builtin.PRIV_USER_PROFILE) else None
    pdoc = await problem.get(self.domainId, pid, uid)
    if pdoc.get('hidden', False):
      self.check_perm(builtin.PERM_VIEW_PROBLEM_HIDDEN)
    udoc, dudoc = await asyncio.gather(user.get_by_uid(pdoc['owner_uid']),
                                       domain.get_user(self.domainId, pdoc['owner_uid']))
    if uid == None:
      rdocs = []
    else:
      # TODO(iceboy): needs to be in sync with contest_detail_problem_submit
      rdocs = await record \
          .get_user_in_problem_multi(uid, self.domainId, pdoc['_id']) \
          .sort([('_id', -1)]) \
          .limit(10) \
          .to_list()
    if not self.prefer_json:
      path_components = self.build_path(
          (self.translate('problem_main'), self.reverse_url('problem_main')),
          (pdoc['title'], self.reverse_url('problem_detail', pid=pdoc['_id'])),
          (self.translate('problem_submit'), None))
      self.render('problem_submit.html', pdoc=pdoc, udoc=udoc, rdocs=rdocs, dudoc=dudoc,
                  page_title=pdoc['title'], path_components=path_components)
    else:
      self.json({'rdocs': rdocs})

  @base.requirePriv(builtin.PRIV_USER_PROFILE)
  @base.requirePerm(builtin.PERM_SUBMIT_PROBLEM)
  @base.route_argument
  @base.post_argument
  @base.require_csrf_token
  @base.sanitize
  @base.limitRate('add_record', 60, 100)
  async def post(self, *, pid: document.convert_doc_id, lang: str, code: str):
    # TODO(twd2): check status, eg. test, hidden problem, ...
    pdoc = await problem.get(self.domainId, pid)
    if pdoc.get('hidden', False):
      self.check_perm(builtin.PERM_VIEW_PROBLEM_HIDDEN)
    rid = await record.add(self.domainId, pdoc['_id'], constant.record.TYPE_SUBMISSION,
                           self.user['_id'], lang, code)
    self.json_or_redirect(self.reverse_url('record_detail', rid=rid))


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

@app.route('/p/{pid}/data', 'problem_data')
class ProblemDataHandler(base.Handler):
  @base.route_argument
  @base.sanitize
  async def get(self, *, pid: document.convert_doc_id):
    # Judges will have PRIV_READ_PROBLEM_DATA,
    # domain administrators will have PERM_READ_PROBLEM_DATA,
    # problem owner will have PERM_READ_PROBLEM_DATA_SELF.
    pdoc = await problem.get(self.domainId, pid)
    if type(pdoc['data']) is dict:
      return self.redirect(self.reverse_url('problem_data',
                           domainId=pdoc['data']['domain'],
                           pid=pdoc['data']['pid']))
    if (not self.own(pdoc, builtin.PERM_READ_PROBLEM_DATA_SELF)
        and not self.has_perm(builtin.PERM_READ_PROBLEM_DATA)):
      self.check_priv(builtin.PRIV_READ_PROBLEM_DATA)
    fdoc = await problem.get_data(pdoc)
    if not fdoc:
      raise error.ProblemDataNotFoundError(self.domainId, pid)
    self.redirect(options.cdn_prefix.rstrip('/') + \
                  self.reverse_url('fs_get', domainId=builtin.domainId_SYSTEM,
                                   secret=fdoc['metadata']['secret']))


@app.route('/p/copy', 'problem_copy')
class ProblemCopyHandler(base.Handler):
  MAX_PROBLEMS_PER_REQUEST = 20

  @base.requirePriv(builtin.PRIV_USER_PROFILE)
  @base.requirePerm(builtin.PERM_CREATE_PROBLEM)
  async def get(self):
    self.render('problem_copy.html')

  @base.requirePriv(builtin.PRIV_USER_PROFILE)
  @base.requirePerm(builtin.PERM_CREATE_PROBLEM)
  @base.post_argument
  @base.require_csrf_token
  @base.sanitize
  @base.limitRate('copy_problems', 30, 10)
  async def post(self, *, src_domainId: str, src_pids: str,
                 numeric_pid: bool=False, hidden: bool=False):
    src_ddoc, src_dudoc = await asyncio.gather(domain.get(src_domainId),
                                               domain.get_user(src_domainId, self.user['_id']))
    if not src_dudoc:
      src_dudoc = {}
    if not self.dudoc_has_perm(ddoc=src_ddoc, dudoc=src_dudoc, udoc=self.user,
                               perm=builtin.PERM_VIEW_PROBLEM):
      # TODO: This is the source domain's PermissionError.
      raise error.PermissionError(builtin.PERM_VIEW_PROBLEM)

    src_pids = misc.dedupe(map(document.convert_doc_id, src_pids.replace('\r\n', '\n').split('\n')))
    if len(src_pids) > self.MAX_PROBLEMS_PER_REQUEST:
      raise error.BatchCopyLimitExceededError(self.MAX_PROBLEMS_PER_REQUEST, len(src_pids))
    pdocs = await problem.get_multi(domainId=src_domainId, doc_id={'$in': src_pids}) \
      .sort('doc_id', 1) \
      .to_list()

    exist_pids = [pdoc['_id'] for pdoc in pdocs]
    if len(src_pids) != len(exist_pids):
      for pid in src_pids:
        if pid not in exist_pids:
          raise error.ProblemNotFoundError(src_domainId, pid)

    for pdoc in pdocs:
      if pdoc.get('hidden', False):
        if not self.dudoc_has_perm(ddoc=src_ddoc, dudoc=src_dudoc, udoc=self.user,
                                   perm=builtin.PERM_VIEW_PROBLEM_HIDDEN):
          # TODO: This is the source domain's PermissionError.
          raise error.PermissionError(builtin.PERM_VIEW_PROBLEM_HIDDEN)

    for pdoc in pdocs:
      pid = None
      if numeric_pid:
        pid = await domain.inc_pid_counter(self.domainId)
      await problem.copy(pdoc, self.domainId, self.user['_id'], pid, hidden)

    self.redirect(self.reverse_url('problem_main'))


@app.route('/p/{pid}/edit', 'problem_edit')
class ProblemEditHandler(base.Handler):
  @base.requirePriv(builtin.PRIV_USER_PROFILE)
  @base.route_argument
  @base.sanitize
  async def get(self, *, pid: document.convert_doc_id):
    uid = self.user['_id'] if self.has_priv(builtin.PRIV_USER_PROFILE) else None
    pdoc = await problem.get(self.domainId, pid, uid)
    if not self.own(pdoc, builtin.PERM_EDIT_PROBLEM_SELF):
      self.check_perm(builtin.PERM_EDIT_PROBLEM)
    udoc, dudoc = await asyncio.gather(user.get_by_uid(pdoc['owner_uid']),
                                       domain.get_user(self.domainId, pdoc['owner_uid']))
    path_components = self.build_path(
        (self.translate('problem_main'), self.reverse_url('problem_main')),
        (pdoc['title'], self.reverse_url('problem_detail', pid=pdoc['_id'])),
        (self.translate('problem_edit'), None))
    self.render('problem_edit.html', pdoc=pdoc, udoc=udoc, dudoc=dudoc,
                page_title=pdoc['title'], path_components=path_components)

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


@app.route('/p/{pid}/settings', 'problem_settings')
class ProblemSettingsHandler(base.Handler):
  @base.requirePriv(builtin.PRIV_USER_PROFILE)
  @base.route_argument
  @base.sanitize
  async def get(self, *, pid: document.convert_doc_id):
    uid = self.user['_id'] if self.has_priv(builtin.PRIV_USER_PROFILE) else None
    pdoc = await problem.get(self.domainId, pid, uid)
    if not self.own(pdoc, builtin.PERM_EDIT_PROBLEM_SELF):
      self.check_perm(builtin.PERM_EDIT_PROBLEM)
    udoc, dudoc = await asyncio.gather(user.get_by_uid(pdoc['owner_uid']),
                                       domain.get_user(self.domainId, pdoc['owner_uid']))
    path_components = self.build_path(
        (self.translate('problem_main'), self.reverse_url('problem_main')),
        (pdoc['title'], self.reverse_url('problem_detail', pid=pdoc['_id'])),
        (self.translate('problem_settings'), None))
    self.render('problem_settings.html', pdoc=pdoc, udoc=udoc, dudoc=dudoc,
                categories=problem.get_categories(),
                page_title=pdoc['title'], path_components=path_components)

  def split_tags(self, s):
    s = s.replace('ï¼Œ', ',') # Chinese ', '
    return list(filter(lambda _: _ != '', map(lambda _: _.strip(), s.split(','))))

  @base.requirePriv(builtin.PRIV_USER_PROFILE)
  @base.route_argument
  @base.post_argument
  @base.require_csrf_token
  @base.sanitize
  async def post(self, *, pid: document.convert_doc_id, hidden: bool=False,
                 category: str, tag: str,
                 difficulty_setting: int, difficulty_admin: str=''):
    pdoc = await problem.get(self.domainId, pid)
    if not self.own(pdoc, builtin.PERM_EDIT_PROBLEM_SELF):
      self.check_perm(builtin.PERM_EDIT_PROBLEM)
    category = self.split_tags(category)
    tag = self.split_tags(tag)
    for c in category:
      if not (c in builtin.PROBLEM_CATEGORIES
              or c in builtin.PROBLEM_SUB_CATEGORIES):
        raise error.ValidationError('category')
    if difficulty_setting not in problem.SETTING_DIFFICULTY_RANGE:
        raise error.ValidationError('difficulty_setting')
    if difficulty_admin:
        try:
          difficulty_admin = int(difficulty_admin)
        except ValueError:
          raise error.ValidationError('difficulty_admin')
    else:
      difficulty_admin = None
    await problem.edit(self.domainId, pdoc['_id'], hidden=hidden,
                       category=category, tag=tag,
                       difficulty_setting=difficulty_setting, difficulty_admin=difficulty_admin)
    await job.difficulty.update_problem(self.domainId, pdoc['_id'])
    self.json_or_redirect(self.reverse_url('problem_detail', pid=pid))


@app.route('/p/{pid}/upload', 'problem_upload')
class ProblemUploadHandler(base.Handler):
  def get_content_type(self, filename):
    if os.path.splitext(filename)[1].lower() != '.zip':
      raise error.FileTypeNotAllowedError(filename)
    return 'application/zip'

  @base.requirePriv(builtin.PRIV_USER_PROFILE)
  @base.route_argument
  @base.sanitize
  async def get(self, *, pid: document.convert_doc_id):
    pdoc = await problem.get(self.domainId, pid)
    if not self.own(pdoc, builtin.PERM_EDIT_PROBLEM_SELF):
      self.check_perm(builtin.PERM_EDIT_PROBLEM)
    if (not self.own(pdoc, builtin.PERM_READ_PROBLEM_DATA_SELF)
        and not self.has_perm(builtin.PERM_READ_PROBLEM_DATA)):
      self.check_priv(builtin.PRIV_READ_PROBLEM_DATA)
    md5 = await fs.get_md5(await problem.get_data(pdoc))
    self.render('problem_upload.html', pdoc=pdoc, md5=md5)

  @base.requirePriv(builtin.PRIV_USER_PROFILE)
  @base.route_argument
  @base.multipart_argument
  @base.require_csrf_token
  @base.sanitize
  async def post(self, *, pid: document.convert_doc_id, file: objectid.ObjectId):
    pdoc = await problem.get(self.domainId, pid)
    if not self.own(pdoc, builtin.PERM_EDIT_PROBLEM_SELF):
      self.check_perm(builtin.PERM_EDIT_PROBLEM)
    if (not self.own(pdoc, builtin.PERM_READ_PROBLEM_DATA_SELF)
        and not self.has_perm(builtin.PERM_READ_PROBLEM_DATA)):
      self.check_priv(builtin.PRIV_READ_PROBLEM_DATA)
    if pdoc.get('data') and type(pdoc['data']) is objectid.ObjectId:
      await fs.unlink(pdoc['data'])
    await problem.set_data(self.domainId, pid, file)
    self.json_or_redirect(self.url)


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


@app.route('/p/search', 'problem_search')
class ProblemSearchHandler(base.Handler):
  @base.get_argument
  @base.route_argument
  @base.sanitize
  async def get(self, *, q: str):
    q = q.strip()
    if not q:
      self.json_or_redirect(self.referer_or_main)
      return
    try:
      pdoc = await problem.get(self.domainId, document.convert_doc_id(q))
    except error.ProblemNotFoundError:
      pdoc = None
    if pdoc:
      self.redirect(self.reverse_url('problem_detail', pid=pdoc['_id']))
      return
    self.redirect('http://cn.bing.com/search?q={0}+site%3A{1}' \
                  .format(parse.quote(q), parse.quote(options.url_prefix)))

*/