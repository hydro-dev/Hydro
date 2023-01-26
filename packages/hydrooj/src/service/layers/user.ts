import { CsrfTokenError, NotFoundError } from '../../error';
import avatar from '../../lib/avatar';
import { PERM } from '../../model/builtin';
import UserModel from '../../model/user';
import type { KoaContext } from '../server';

export default async (ctx: KoaContext, next) => {
    // User Layer
    const { request, args, domain } = ctx.HydroContext;
    const domainId = domain ? args.domainId : 'system';
    let user = await UserModel.getById(domainId, ctx.session.uid, ctx.session.scope);
    if (!user) {
        ctx.session.uid = 0;
        ctx.session.scope = PERM.PERM_ALL.toString();
        user = await UserModel.getById(domainId, ctx.session.uid, ctx.session.scope);
    }
    if (user._id === 0) delete user.viewLang;
    user.avatarUrl = avatar(user.avatar, 128);
    ctx.HydroContext.user = user;
    if (!domain) {
        ctx.pendingError = new NotFoundError(args.domainId);
        args.domainId = 'system';
    }
    if (request.method === 'post' && request.headers.referer && !ctx.cors) {
        const host = new URL(request.headers.referer).host;
        if (host !== request.host) ctx.pendingError = new CsrfTokenError(host);
    }
    await next();
};
