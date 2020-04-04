const
    { GET, POST } = require('../service/server.js'),
    user = require('../model/user'),
    token = require('../model/token'),
    system = require('../model/system'),
    mail = require('../lib/mail'),
    validator = require('../lib/validator'),
    options = require('../options'),
    { PERM_REGISTER_USER, PERM_LOGGEDIN } = require('../permission'),
    { requirePerm, limitRate } = require('./tools'),
    { UserAlreadyExistError, InvalidTokenError, VerifyPasswordError, UserNotFoundError, LoginError } = require('../error');

GET('/user', async ctx => {
    let udoc = await user.getById(ctx.session.uid);
    ctx.templateName = 'user_detail.html';
    ctx.body = { udoc };
});
GET('/login', async ctx => {
    ctx.templateName = 'user_login.html';
});
POST('/login', async ctx => {
    let { uname, password, rememberme = false } = ctx.request.body;
    let udoc = await user.getByUname(uname);
    if (!udoc) throw new LoginError(uname);
    if (udoc) udoc.checkPassword(password);
    await user.setById(udoc._id, { loginat: new Date(), loginip: ctx.request.ip });
    udoc.salt = '';
    udoc.password = '';
    console.log(udoc);
    ctx.session.uid = udoc._id;
    ctx.session.rememberme = rememberme;
    ctx.body = {};
    let referer = ctx.request.headers.referer || '/';
    ctx.setRedirect = referer.endsWith('/login') ? '/' : referer;
});
POST('/logout', requirePerm(PERM_LOGGEDIN), async ctx => {
    ctx.session = { uid: 1 };
    ctx.body = {};
});
GET('/register/:code', requirePerm(PERM_REGISTER_USER), async ctx => {
    let code = ctx.request.body.code;
    let { mail } = await token.get(code, token.TYPE_REGISTRATION);
    if (!mail) throw new InvalidTokenError(token.TYPE_REGISTRATION, code);
    ctx.body = { mail };
});
GET('/register/:code', requirePerm(PERM_REGISTER_USER), async ctx => {
    let { code, password, verify_password, uname } = ctx.request.body;
    let { mail } = await token.get(code, token.TYPE_REGISTRATION);
    if (!mail) throw new InvalidTokenError(token.TYPE_REGISTRATION, code);
    if (password != verify_password) throw new VerifyPasswordError();
    let uid = await system.incUserCounter();
    await user.add(uid, uname, password, mail, ctx.remote_ip);
    await token.delete(code, token.TYPE_REGISTRATION);
    ctx.session.uid = uid;
    ctx.body = {};
});

if (options.smtp.user) {
    POST('/register', requirePerm(PERM_REGISTER_USER), limitRate('send_mail', 3600, 30), async ctx => {
        let email = ctx.request.body.email;
        validator.check_mail(email);
        if (await user.get_by_mail(email)) throw new UserAlreadyExistError(email);
        let rid = await token.add(token.TYPE_REGISTRATION, options.registration_token_expire_seconds, { mail: email });
        let m = await ctx.render('user_register_mail', { url: `/register/${rid}` }, true);
        await mail.send_mail(email, 'Sign Up', 'user_register_mail', m);
        ctx.body = {};
    });
    POST('/lostpass', limitRate('send_mail', 3600, 30), async ctx => {
        let email = ctx.request.body.mail;
        validator.check_mail(email);
        let udoc = await user.getByEmail(email);
        if (!udoc) throw new UserNotFoundError(email);
        let tid = await token.add(
            token.TYPE_LOSTPASS,
            options.lostpass_token_expire_seconds,
            { uid: udoc._id }
        );
        let m = await ctx.render('user_lostpass_mail', { url: `/lostpass/${tid}`, uname: udoc.uname }, true);
        await mail.send_mail(email, 'Lost Password', 'user_lostpass_mail', m);
        ctx.body = {};
    });
    GET('/lostpass/:code', async ctx => {
        let code = ctx.params.code;
        let tdoc = await token.get(code, token.TYPE_LOSTPASS);
        if (!tdoc) throw new InvalidTokenError(token.TYPE_LOSTPASS, code);
        let udoc = await user.getById(tdoc.uid);
        ctx.body = { uname: udoc.uname };
    });
    POST('/lostpass/:code', async ctx => {
        let code = ctx.params.code;
        let password = ctx.request.body.password;
        let verify_password = ctx.request.body.verify_password;
        let tdoc = await token.get(code, token.TYPE_LOSTPASS);
        if (!tdoc) throw new InvalidTokenError(token.TYPE_LOSTPASS, code);
        if (password != verify_password) throw new VerifyPasswordError();
        await user.set_password(tdoc.uid, password);
        await token.delete(code, token.TYPE_LOSTPASS);
        ctx.redirect('/');
    });
} else
    POST('/register', requirePerm(PERM_REGISTER_USER), async ctx => {
        let email = ctx.request.body.email;
        validator.check_mail(email);
        if (await user.get_by_mail(email)) throw new UserAlreadyExistError(email);
        let token = await token.add(token.TYPE_REGISTRATION, options.registration_token_expire_seconds, { mail: email });
        ctx.body = { token };
    });

/*

@app.route('/user/{uid:-?\d+}', 'user_detail')
class UserDetailHandler(base.Handler, UserSettingsMixin):
  @base.route_argument
  @base.sanitize
  async def get(self, *, uid: int):
    is_self_profile = self.has_priv(builtin.PRIV_USER_PROFILE) and self.user['_id'] == uid
    udoc = await user.get_by_uid(uid)
    if not udoc:
      raise error.UserNotFoundError(uid)
    dudoc, sdoc = await asyncio.gather(domain.get_user(self.domainId, udoc['_id']),
                                       token.get_most_recent_session_by_uid(udoc['_id']))

    rdocs = record.get_multi(get_hidden=self.has_priv(builtin.PRIV_VIEW_HIDDEN_RECORD),
                             uid=uid).sort([('_id', -1)])
    rdocs = await rdocs.limit(10).to_list()
    pdict = await problem.get_dict_multi_domain((rdoc['domainId'], rdoc['pid']) for rdoc in rdocs)
    # check hidden problem
    if not self.has_perm(builtin.PERM_VIEW_PROBLEM_HIDDEN):
      f = {'hidden': False}
    else:
      f = {}
    pdocs = problem.get_multi(domainId=self.domainId, owner_uid=uid, **f).sort([('_id', -1)])
    pcount = await pdocs.count()
    pdocs = await pdocs.limit(10).to_list()

    psdocs = problem.get_multi_solution_by_uid(self.domainId, uid)
    psdocs_hot = problem.get_multi_solution_by_uid(self.domainId, uid)
    pscount = await psdocs.count()
    psdocs = await psdocs.limit(10).to_list()
    psdocs_hot = await psdocs_hot.sort([('vote', -1), ('doc_id', -1)]).limit(10).to_list()

    if self.has_perm(builtin.PERM_VIEW_DISCUSSION):
      ddocs = discussion.get_multi(self.domainId, owner_uid=uid)
      dcount = await ddocs.count()
      ddocs = await ddocs.limit(10).to_list()
      vndict = await discussion.get_dict_vnodes(self.domainId, map(discussion.node_id, ddocs))
    else:
      ddocs = []
      vndict = {}
      dcount = 0

    self.render('user_detail.html', is_self_profile=is_self_profile,
                udoc=udoc, dudoc=dudoc, sdoc=sdoc,
                rdocs=rdocs, pdict=pdict, pdocs=pdocs, pcount=pcount,
                psdocs=psdocs, pscount=pscount, psdocs_hot=psdocs_hot,
                ddocs=ddocs, dcount=dcount, vndict=vndict)


@app.route('/user/search', 'user_search')
class UserSearchHandler(base.Handler):
  def modify_udoc(self, udict, key):
    udoc = udict[key]
    gravatar_url = misc.gravatar_url(udoc.get('gravatar'))
    if 'gravatar' in udoc and udoc['gravatar']:
      udict[key] = {**udoc,
                    'gravatar_url': gravatar_url,
                    'gravatar': ''}

  @base.requirePriv(builtin.PRIV_USER_PROFILE)
  @base.get_argument
  @base.route_argument
  @base.sanitize
  async def get(self, *, q: str, exact_match: bool=False):
    if exact_match:
      udocs = []
    else:
      udocs = await user.get_prefix_list(q, user.PROJECTION_PUBLIC, 20)
    try:
      udoc = await user.get_by_uid(int(q), user.PROJECTION_PUBLIC)
      if udoc:
        udocs.insert(0, udoc)
    except ValueError as e:
      pass
    for i in range(len(udocs)):
      self.modify_udoc(udocs, i)
    self.json(udocs)

*/
