/*
@app.route('/p/{pid}/solution', 'problem_solution')
class ProblemSolutionHandler(base.OperationHandler):
  SOLUTIONS_PER_PAGE = 20

  @base.requirePerm(builtin.PERM_VIEW_PROBLEM_SOLUTION)
  @base.get_argument
  @base.route_argument
  @base.sanitize
  async def get(self, *, pid: document.convert_doc_id, page: int=1):
    uid = self.user['_id'] if self.has_priv(builtin.PRIV_USER_PROFILE) else None
    pdoc = await problem.get(self.domainId, pid, uid)
    if pdoc.get('hidden', False):
      self.check_perm(builtin.PERM_VIEW_PROBLEM_HIDDEN)
    psdocs, pcount, pscount = await pagination.paginate(
        problem.get_multi_solution(self.domainId, pdoc['doc_id']),
        page, self.SOLUTIONS_PER_PAGE)
    uids = {pdoc['owner_uid']}
    uids.update(psdoc['owner_uid'] for psdoc in psdocs)
    for psdoc in psdocs:
      if 'reply' in psdoc:
        uids.update(psrdoc['owner_uid'] for psrdoc in psdoc['reply'])
    udict, dudict, pssdict = await asyncio.gather(
        user.get_dict(uids),
        domain.get_dict_user_by_uid(self.domainId, uids),
        problem.get_dict_solution_status(
            self.domainId, (psdoc['doc_id'] for psdoc in psdocs), self.user['_id']))
    dudict[self.user['_id']] = self.domain_user
    path_components = self.build_path(
        (self.translate('problem_main'), self.reverse_url('problem_main')),
        (pdoc['title'], self.reverse_url('problem_detail', pid=pdoc['doc_id'])),
        (self.translate('problem_solution'), None))
    self.render('problem_solution.html', path_components=path_components,
                pdoc=pdoc, psdocs=psdocs, page=page, pcount=pcount, pscount=pscount,
                udict=udict, dudict=dudict, pssdict=pssdict)

  @base.requirePriv(builtin.PRIV_USER_PROFILE)
  @base.requirePerm(builtin.PERM_CREATE_PROBLEM_SOLUTION)
  @base.route_argument
  @base.require_csrf_token
  @base.sanitize
  async def post_submit(self, *, pid: document.convert_doc_id, content: str):
    pdoc = await problem.get(self.domainId, pid)
    if pdoc.get('hidden', False):
      self.check_perm(builtin.PERM_VIEW_PROBLEM_HIDDEN)
    await problem.add_solution(self.domainId, pdoc['doc_id'], self.user['_id'], content)
    self.json_or_redirect(self.url)

  @base.requirePriv(builtin.PRIV_USER_PROFILE)
  @base.route_argument
  @base.require_csrf_token
  @base.sanitize
  async def post_edit_solution(self, *, pid: document.convert_doc_id,
                               psid: document.convert_doc_id, content: str):
    pdoc = await problem.get(self.domainId, pid)
    if pdoc.get('hidden', False):
      self.check_perm(builtin.PERM_VIEW_PROBLEM_HIDDEN)
    psdoc = await problem.get_solution(self.domainId, psid, pdoc['doc_id'])
    if not self.own(psdoc, builtin.PERM_EDIT_PROBLEM_SOLUTION_SELF):
      self.check_perm(builtin.PERM_EDIT_PROBLEM_SOLUTION)
    psdoc = await problem.set_solution(self.domainId, psdoc['doc_id'],
                                       content=content)
    self.json_or_redirect(self.url)

  @base.requirePriv(builtin.PRIV_USER_PROFILE)
  @base.route_argument
  @base.require_csrf_token
  @base.sanitize
  async def post_delete_solution(self, *, pid: document.convert_doc_id,
                                 psid: document.convert_doc_id):
    pdoc = await problem.get(self.domainId, pid)
    if pdoc.get('hidden', False):
      self.check_perm(builtin.PERM_VIEW_PROBLEM_HIDDEN)
    psdoc = await problem.get_solution(self.domainId, psid, pdoc['doc_id'])
    if not self.own(psdoc, builtin.PERM_DELETE_PROBLEM_SOLUTION_SELF):
      self.check_perm(builtin.PERM_DELETE_PROBLEM_SOLUTION)
    await oplog.add(self.user['_id'], oplog.TYPE_DELETE_DOCUMENT, doc=psdoc)
    await problem.delete_solution(self.domainId, psdoc['doc_id'])
    self.json_or_redirect(self.url)

  @base.requirePriv(builtin.PRIV_USER_PROFILE)
  @base.route_argument
  @base.require_csrf_token
  @base.sanitize
  async def post_edit_reply(self, *, pid: document.convert_doc_id,
                            psid: document.convert_doc_id, psrid: document.convert_doc_id,
                            content: str):
    pdoc = await problem.get(self.domainId, pid)
    if pdoc.get('hidden', False):
      self.check_perm(builtin.PERM_VIEW_PROBLEM_HIDDEN)
    psdoc, psrdoc = await problem.get_solution_reply(self.domainId, psid, psrid)
    if not psdoc or psdoc['parent_doc_id'] != pdoc['doc_id']:
      raise error.DocumentNotFoundError(self.domainId, document.TYPE_PROBLEM_SOLUTION, psid)
    if not self.own(psrdoc, builtin.PERM_EDIT_PROBLEM_SOLUTION_REPLY_SELF):
      self.check_perm(builtin.PERM_EDIT_PROBLEM_SOLUTION_REPLY)
    await problem.edit_solution_reply(self.domainId, psid, psrid, content)
    self.json_or_redirect(self.url)

  @base.requirePriv(builtin.PRIV_USER_PROFILE)
  @base.route_argument
  @base.require_csrf_token
  @base.sanitize
  async def post_delete_reply(self, *, pid: document.convert_doc_id,
                            psid: document.convert_doc_id, psrid: document.convert_doc_id):
    pdoc = await problem.get(self.domainId, pid)
    if pdoc.get('hidden', False):
      self.check_perm(builtin.PERM_VIEW_PROBLEM_HIDDEN)
    psdoc, psrdoc = await problem.get_solution_reply(self.domainId, psid, psrid)
    if not psdoc or psdoc['parent_doc_id'] != pdoc['doc_id']:
      raise error.DocumentNotFoundError(self.domainId, document.TYPE_PROBLEM_SOLUTION, psid)
    if not self.own(psrdoc, builtin.PERM_DELETE_PROBLEM_SOLUTION_REPLY_SELF):
      self.check_perm(builtin.PERM_DELETE_PROBLEM_SOLUTION_REPLY)
    await oplog.add(self.user['_id'], oplog.TYPE_DELETE_SUB_DOCUMENT, sub_doc=psrdoc,
                    doc_type=psdoc['doc_type'], doc_id=psdoc['doc_id'])
    await problem.delete_solution_reply(self.domainId, psid, psrid)
    self.json_or_redirect(self.url)

  @base.requirePriv(builtin.PRIV_USER_PROFILE)
  @base.requirePerm(builtin.PERM_VOTE_PROBLEM_SOLUTION)
  @base.route_argument
  @base.require_csrf_token
  @base.sanitize
  async def upvote_downvote(self, *,
                            pid: document.convert_doc_id,
                            psid: document.convert_doc_id,
                            value: int):
    pdoc = await problem.get(self.domainId, pid)
    if pdoc.get('hidden', False):
      self.check_perm(builtin.PERM_VIEW_PROBLEM_HIDDEN)
    psdoc = await problem.get_solution(self.domainId, psid, pdoc['doc_id'])
    psdoc, pssdoc = await problem.vote_solution(self.domainId, psdoc['doc_id'],
                                                self.user['_id'], value)
    self.json_or_redirect(self.url, vote=psdoc['vote'], user_vote=pssdoc['vote'])

  post_upvote = functools.partialmethod(upvote_downvote, value=1)
  post_downvote = functools.partialmethod(upvote_downvote, value=-1)

  @base.requirePriv(builtin.PRIV_USER_PROFILE)
  @base.requirePerm(builtin.PERM_REPLY_PROBLEM_SOLUTION)
  @base.route_argument
  @base.require_csrf_token
  @base.sanitize
  async def post_reply(self, *,
                       pid: document.convert_doc_id,
                       psid: document.convert_doc_id,
                       content: str):
    pdoc = await problem.get(self.domainId, pid)
    if pdoc.get('hidden', False):
      self.check_perm(builtin.PERM_VIEW_PROBLEM_HIDDEN)
    psdoc = await problem.get_solution(self.domainId, psid, pdoc['doc_id'])
    await problem.reply_solution(self.domainId, psdoc['doc_id'], self.user['_id'], content)
    self.json_or_redirect(self.url)


@app.route('/p/{pid}/solution/{psid:\w{24}}/raw', 'problem_solution_raw')
class ProblemSolutionRawHandler(base.Handler):
  @base.requirePerm(builtin.PERM_VIEW_PROBLEM_SOLUTION)
  @base.route_argument
  @base.sanitize
  async def get(self, *, pid: document.convert_doc_id, psid: document.convert_doc_id):
    pdoc = await problem.get(self.domainId, pid)
    if pdoc.get('hidden', False):
      self.check_perm(builtin.PERM_VIEW_PROBLEM_HIDDEN)
    psdoc = await problem.get_solution(self.domainId, psid, pdoc['doc_id'])
    self.response.content_type = 'text/markdown'
    self.response.text = psdoc['content']


@app.route('/p/{pid}/solution/{psid:\w{24}}/{psrid:\w{24}}/raw', 'problem_solution_reply_raw')
class ProblemSolutionReplyRawHandler(base.Handler):
  @base.requirePerm(builtin.PERM_VIEW_PROBLEM_SOLUTION)
  @base.route_argument
  @base.sanitize
  async def get(self, *, pid: document.convert_doc_id, psid: document.convert_doc_id,
                psrid: objectid.ObjectId):
    pdoc = await problem.get(self.domainId, pid)
    if pdoc.get('hidden', False):
      self.check_perm(builtin.PERM_VIEW_PROBLEM_HIDDEN)
    psdoc, psrdoc = await problem.get_solution_reply(self.domainId, psid, psrid)
    if not psdoc or psdoc['parent_doc_id'] != pdoc['doc_id']:
      raise error.DocumentNotFoundError(self.domainId, document.TYPE_PROBLEM_SOLUTION, psid)
    self.response.content_type = 'text/markdown'
    self.response.text = psrdoc['content']
    */