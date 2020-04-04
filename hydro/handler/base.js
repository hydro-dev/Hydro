const
    { MIDDLEWARE } = require('../service/server.js'),
    user = require('../model/user'),
    blacklist = require('../model/blacklist'),
    token = require('../model/token'),
    options = require('../options'),
    {
        UserNotFoundError,
        BlacklistedError,
        PermissionError
    } = require('../error');

MIDDLEWARE(async (ctx, next) => {
    try {
        let sid = ctx.cookies.get('sid');
        let save = ctx.cookies.get('save');
        let tokenType, expireSeconds;
        tokenType = token.TYPE_SESSION;
        if (save) expireSeconds = options.session.saved_expire_seconds;
        else expireSeconds = options.session.unsaved_expire_seconds;
        ctx.session = sid ?
            await token.update(sid, tokenType, expireSeconds, Object.assign({
                update_ip: ctx.request.ip,
                update_ua: ctx.request.headers['user-agent'] || ''
            })) : { uid: 1 };
        if (!ctx.session) ctx.session = { uid: 1 };
        let bdoc = await blacklist.get(ctx.request.ip);
        if (bdoc) throw new BlacklistedError(ctx.request.ip);
        ctx.state.user = await user.getById(ctx.session.uid);
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
        ctx.csrf_token = await token.add(token.TYPE_CSRF_TOKEN, 600, ctx.path);
        console.log(ctx.session.uid);
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
        console.log(ctx.session.sid, ctx.session.uid);
        let cookie = { secure: options.session.secure, httponly: true };
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