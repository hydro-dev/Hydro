import type { KoaContext } from '@hydrooj/framework';
import { PERM, PRIV } from '../../model/builtin';
import UserModel from '../../model/user';

export default async (ctx: KoaContext, next) => {
    // User Layer
    const { args, domain } = ctx.HydroContext;
    const domainId = domain ? args.domainId : 'system';
    let user = await UserModel.getById(domainId, ctx.session.uid, ctx.session.scope);
    if (!user) {
        ctx.session.uid = 0;
        ctx.session.scope = PERM.PERM_ALL.toString();
        user = await UserModel.getById(domainId, ctx.session.uid, ctx.session.scope);
    }
    if (user._id === 0) delete user.viewLang;
    else if (!user._udoc.ip.includes(ctx.request.ip) && user.hasPriv(PRIV.PRIV_USER_PROFILE)) {
        await UserModel.setById(user._id, { loginip: ctx.request.ip });
    }
    ctx.HydroContext.user = await user.private();
    await next();
};
