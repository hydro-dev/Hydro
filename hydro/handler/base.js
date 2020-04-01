const
    { MIDDLEWARE } = require('../service/server.js'),
    user = require('../model/user'),
    domain = require('../model/domain'),
    blacklist = require('../model/blacklist'),
    token = require('../model/token'),
    options = require('../options'),
    {
        UserNotFoundError,
        BlacklistedError,
        PermissionError,
        PrivilegeError
    } = require('../error');

MIDDLEWARE(async (ctx, next) => {
    try {
        ctx.state.domainId = 'system';
        let sid = ctx.cookies.get('sid');
        let save = ctx.cookies.get('save');
        let tokenType, expireSeconds;
        if (save) {
            tokenType = token.TYPE_SAVED_SESSION;
            expireSeconds = options.session.saved_expire_seconds;
        } else {
            tokenType = token.TYPE_UNSAVED_SESSION;
            expireSeconds = options.session.unsaved_expire_seconds;
        }
        ctx.session = sid ?
            await token.update(sid, tokenType, expireSeconds, Object.assign({
                update_ip: ctx.request.ip,
                update_ua: ctx.request.headers['user-agent'] || ''
            })) : { uid: 1 };
        if (!ctx.session) ctx.session = { uid: 1 };
        let bdoc = await blacklist.get(ctx.request.ip);
        if (bdoc) throw new BlacklistedError(ctx.request.ip);
        console.log(ctx.session.uid);
        [ctx.state.user, ctx.state.domain] = await Promise.all([
            user.getById(ctx.session.uid, ctx.state.domainId),
            domain.get(ctx.state.domainId)
        ]);
        if (!ctx.state.user) throw new UserNotFoundError(ctx.session.uid);
        ctx.checkPerm = function (perm) {
            for (let i in arguments) {
                if (arguments[i] instanceof Array) {
                    let p = false;
                    for (let j in arguments)
                        if (ctx.state.user.hasPerm(arguments[i][j])) {
                            p = true;
                            break;
                        }
                    if (!p) throw new PermissionError([arguments[i]]);
                } else {
                    if (ctx.state.user.hasPerm(arguments[i])) continue;
                    else throw new PermissionError([[arguments[i]]]);
                }
            }
        };
        ctx.checkPriv = function (priv) {
            for (let i in arguments) {
                if (arguments[i] instanceof Array) {
                    let p = false;
                    for (let j in arguments)
                        if (ctx.state.user.hasPriv(arguments[i][j])) {
                            p = true;
                            break;
                        }
                    if (!p) throw new PrivilegeError([arguments[i]]);
                } else {
                    if (ctx.state.user.hasPriv(arguments[i])) continue;
                    else throw new PrivilegeError([[arguments[i]]]);
                }
            }
        };
        await next();
        if (ctx.session.sid)
            await token.update(ctx.session.sid, tokenType, expireSeconds, Object.assign({
                updateIp: ctx.request.ip,
                updateUa: ctx.request.headers['user-agent'] || ''
            }));
        else
            [ctx.session.sid] = await token.add(tokenType, expireSeconds, Object.assign({
                create_ip: ctx.request.ip,
                create_ua: ctx.request.headers['user-agent'] || '',
                update_ip: ctx.request.ip,
                update_ua: ctx.request.headers['user-agent'] || ''
            }, ctx.session));
        let cookie = { domain: options.session.domain, secure: options.session.secure, httponly: true };
        if (save) {
            cookie.expires = ctx.session.expireAt, cookie.maxAge = expireSeconds;
            ctx.cookies.set('save', 'true', cookie);
        }
        ctx.cookies.set('sid', ctx.session.sid, cookie);
    } catch (e) {
        console.error(e.message, e.params);
        console.error(e.stack);
        ctx.body = { error: { message: e.message, params: e.params, stack: e.stack } };
    }
});