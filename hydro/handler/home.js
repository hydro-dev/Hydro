const {
    VerifyPasswordError, UserAlreadyExistError, InvalidTokenError,
    NotFoundError,
} = require('../error');
const options = require('../options');
const { Route, Handler } = require('../service/server');
const md5 = require('../lib/md5');
const contest = require('../model/contest');
const user = require('../model/user');
const setting = require('../model/setting');
const token = require('../model/token');
const training = require('../model/training');
const {
    PERM_VIEW_TRAINING, PERM_VIEW_CONTEST, PERM_VIEW_DISCUSSION,
    PERM_LOGGEDIN,
} = require('../permission');
const { CONTESTS_ON_MAIN, TRAININGS_ON_MAIN, DISCUSSIONS_ON_MAIN } = require('../options').constants;

class HomeHandler extends Handler {
    async contest() {
        if (this.user.hasPerm(PERM_VIEW_CONTEST)) {
            const tdocs = await contest.getMulti()
                .limit(CONTESTS_ON_MAIN)
                .toArray();
            const tsdict = await contest.getListStatus(
                this.user._id, tdocs.map((tdoc) => tdoc._id),
            );
            return [tdocs, tsdict];
        }
        return [[], {}];
    }

    async training() {
        if (this.user.hasPerm(PERM_VIEW_TRAINING)) {
            const tdocs = await training.getMulti()
                .sort('_id', 1)
                .limit(TRAININGS_ON_MAIN)
                .toArray();
            const tsdict = await training.getListStatus(
                this.user._id, tdocs.map((tdoc) => tdoc._id),
            );
            return [tdocs, tsdict];
        }
        return [[], {}];
    }

    async discussion() {
        // TODO(masnn)
        // if (this.user.hasPerm(PERM_VIEW_DISCUSSION)) {
        //     const ddocs = await discussion.getMulti()
        //         .limit(DISCUSSIONS_ON_MAIN)
        //         .toArray();
        //     const vndict = await discussion.getListVnodes(map(discussion.node_id, ddocs));
        //     return [ddocs, vndict];
        // }
        return [[], {}];
    }

    async get() {
        const [[tdocs, tsdict], [trdocs, trsdict], [ddocs, vndict]] = await Promise.all([
            this.contest(), this.training(), this.discussion(),
        ]);
        const udict = await user.getList(ddocs.map((ddoc) => ddoc.owner));
        this.response.template = 'main.html';
        this.response.body = {
            tdocs, tsdict, trdocs, trsdict, ddocs, vndict, udict,
        };
    }
}

class HomeSecurityHandler extends Handler {
    async prepare() {
        this.checkPerm(PERM_LOGGEDIN);
    }

    async get() {
        // TODO(iceboy): pagination? or limit session count for uid?
        const sessions = await token.getSessionListByUid(this.user._id);
        const parsed = sessions.map((session) => ({
            ...session,
            updateUa: useragent.parse(session.updateUa || session.createUa || ''),
            updateGeoip: geoip.ip2geo(session.updateIp || session.createIp, this.user.viewLang),
            _id: md5(session._id),
            isCurrent: session._id === this.session._id,
        }));
        this.response.template = 'home_security.html';
        this.response.body = { sessions: parsed };
    }

    async postChangePassword({ current, password, verifyPassword }) {
        if (password !== verifyPassword) throw new VerifyPasswordError();
        await user.changePassword(this.user._id, current, password);
        this.back();
    }

    async postChangeMail({ currentPassword, mail }) {
        this.limitRate('send_mail', 3600, 30);
        this.user.checkPassword(currentPassword);
        const udoc = await user.getByMail(mail);
        if (udoc) throw new UserAlreadyExistError(mail);
        const [rid] = await token.add(
            token.TYPE_CHANGEMAIL,
            options.changemail_token_expire_seconds,
            { uid: this.udoc._id, mail },
        );
        await mail.sendMail(mail, 'Change Email', 'user_changemail_mail.html', {
            url: `/changeMail/${rid}`, uname: this.udoc.uname,
        });
        this.response.template = 'user_changemail_mail_sent.html';
    }

    async postDeleteToken({ tokenDigest }) {
        const sessions = await token.getSessionListByUid(this.user._id);
        for (const session in sessions) {
            if (tokenDigest === md5(session._id)) {
                await token.delete(session._id, token.TYPE_SESSION);
                return this.back();
            }
        }
        throw new InvalidTokenError(tokenDigest);
    }

    async postDeleteAllTokens() {
        await token.deleteByUid(this.user._id);
        this.back();
    }
}

class HomeSettingsHandler extends Handler {
    async prepare() {
        this.checkPerm(PERM_LOGGEDIN);
    }

    async get({ category }) {
        this.response.template = 'home_settings.html';
        if (category === 'preference') {
            this.response.body = {
                category,
                page_name: `home_${category}`,
                settings: setting.PREFERENCE_SETTINGS,
            };
        } else if (category === 'account') {
            this.response.body = {
                category,
                page_name: `home_${category}`,
                settings: setting.ACCOUNT_SETTINGS,
            };
        } else throw new NotFoundError();
    }

    async post(args) {
        // FIXME validation
        await user.setById(this.user._id, args);
        this.back();
    }
}

class UserChangemailWithCodeHandler extends Handler {
    async get({ code }) {
        const tdoc = await token.get(code, token.TYPE_CHANGEMAIL);
        if (!tdoc || tdoc.uid !== this.user._id) {
            throw new InvalidTokenError(code);
        }
        const udoc = await user.getByEmail(tdoc.mail);
        if (udoc) throw new UserAlreadyExistError(tdoc.mail);
        // TODO(twd2): Ensure mail is unique.
        await user.set_mail(this.user._id, tdoc.mail);
        await token.delete(code, token.TYPE_CHANGEMAIL);
        this.response.body = {};
        this.response.redirect = '/home/security';
    }
}

Route('/', HomeHandler);
Route('/home/security', HomeSecurityHandler);
Route('/home/changeMail/:code', UserChangemailWithCodeHandler);
Route('/home/settings/:category', HomeSettingsHandler);

/*
@app.route('/home/messages', 'home_messages', global_route=True)
class HomeMessagesHandler(base.OperationHandler):
  def modify_udoc(this, udict, key):
    udoc = udict.get(key)
    if not udoc:
      return
    gravatar_url = misc.gravatar_url(udoc.get('gravatar'))
    if 'gravatar' in udoc and udoc['gravatar']:
      udict[key] = {**udoc,
                    'gravatar_url': gravatar_url,
                    'gravatar': ''}

  @base.require_priv(builtin.PRIV_USER_PROFILE)
  async def get(this):
    # TODO(iceboy): projection, pagination.
    mdocs = await message.get_multi(this.user['_id']).sort([('_id', -1)]).limit(50).to_list()
    udict = await user.get_dict(
        itertools.chain.from_iterable((mdoc['sender_uid'], mdoc['sendee_uid']) for mdoc in mdocs),
        fields=user.PROJECTION_PUBLIC)
    # TODO(twd2): improve here:
    for mdoc in mdocs:
      this.modify_udoc(udict, mdoc['sender_uid'])
      this.modify_udoc(udict, mdoc['sendee_uid'])
    this.json_or_render('home_messages.html', messages=mdocs, udict=udict)

  @base.require_priv(builtin.PRIV_USER_PROFILE)
  @base.require_csrf_token
  @base.sanitize
  async def post_send_message(this, *, uid: int, content: str):
    udoc = await user.get_by_uid(uid, user.PROJECTION_PUBLIC)
    if not udoc:
      raise error.UserNotFoundError(uid)
    mdoc = await message.add(this.user['_id'], udoc['_id'], content)
    # TODO(twd2): improve here:
    # projection
    sender_udoc = await user.get_by_uid(this.user['_id'], user.PROJECTION_PUBLIC)
    mdoc['sender_udoc'] = sender_udoc
    this.modify_udoc(mdoc, 'sender_udoc')
    mdoc['sendee_udoc'] = udoc
    this.modify_udoc(mdoc, 'sendee_udoc')
    if this.user['_id'] != uid:
      await bus.publish('message_received-' + str(uid), {'type': 'new', 'data': mdoc})
    this.json_or_redirect(this.url, mdoc=mdoc)

  @base.require_priv(builtin.PRIV_USER_PROFILE)
  @base.require_csrf_token
  @base.sanitize
  async def post_reply_message(this, *, message_id: objectid.ObjectId, content: str):
    mdoc, reply = await message.add_reply(message_id, this.user['_id'], content)
    if not mdoc:
      return error.MessageNotFoundError(message_id)
    if mdoc['sender_uid'] != mdoc['sendee_uid']:
      if mdoc['sender_uid'] == this.user['_id']:
        other_uid = mdoc['sendee_uid']
      else:
        other_uid = mdoc['sender_uid']
      mdoc['reply'] = [reply]
      await bus.publish('message_received-' + str(other_uid), {'type': 'reply', 'data': mdoc})
    this.json_or_redirect(this.url, reply=reply)

  @base.require_priv(builtin.PRIV_USER_PROFILE)
  @base.require_csrf_token
  @base.sanitize
  async def post_delete_message(this, *, message_id: objectid.ObjectId):
    await message.delete(message_id, this.user['_id'])
    this.back();


@app.connection_route('/home/messages-conn', 'home_messages-conn', global_route=True)
class HomeMessagesConnection(base.Connection):
  @base.require_priv(builtin.PRIV_USER_PROFILE)
  async def on_open(this):
    await super(HomeMessagesConnection, this).on_open()
    bus.subscribe(this.on_message_received, ['message_received-' + str(this.user['_id'])])

  async def on_message_received(this, e):
    this.send(**e['value'])

  async def on_close(this):
    bus.unsubscribe(this.on_message_received)


@app.route('/home/file', 'home_file', global_route=True)
class HomeFileHandler(base.OperationHandler):
  def file_url(this, fdoc):
    return options.cdn_prefix.rstrip('/') + \
      this.reverse_url('fs_get', domain_id=builtin.DOMAIN_ID_SYSTEM,
                       secret=fdoc['metadata']['secret'])

  @base.require_priv(builtin.PRIV_USER_PROFILE)
  async def get(this):
    ufdocs = await userfile.get_multi(owner_uid=this.user['_id']).to_list()
    fdict = await fs.get_meta_dict(ufdoc.get('file_id') for ufdoc in ufdocs)
    this.render('home_file.html', ufdocs=ufdocs, fdict=fdict)

  @base.require_priv(builtin.PRIV_USER_PROFILE)
  @base.post_argument
  @base.require_csrf_token
  @base.sanitize
  async def post_delete(this, *, ufid: document.convert_doc_id):
    ufdoc = await userfile.get(ufid)
    if not this.own(ufdoc, priv=builtin.PRIV_DELETE_FILE_this):
      this.check_priv(builtin.PRIV_DELETE_FILE)
    result = await userfile.delete(ufdoc['doc_id'])
    if result:
      await userfile.dec_usage(this.user['_id'], ufdoc['length'])
    this.redirect(this.referer_or_main)
*/
