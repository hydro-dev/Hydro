import { NotFoundError } from '../../error';
import { PERM } from '../../model/builtin';
import UserModel from '../../model/user';
import type { KoaContext } from '../server';

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
    ctx.HydroContext.user = await user.private();
    if (!domain) {
        ctx.pendingError = new NotFoundError(args.domainId);
        args.domainId = 'system';
    }
    await next();
};
