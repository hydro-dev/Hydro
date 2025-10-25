import { KoaContext, NotFoundError } from '@hydrooj/framework';
import BlackListModel from '../../model/blacklist';
import DomainModel from '../../model/domain';
import system from '../../model/system';

export default async (ctx: KoaContext, next) => {
    const forceDomain = /^\/d\/([^/]+)\//.exec(ctx.request.path);
    ctx.originalPath = ctx.request.path;
    ctx.path = ctx.request.path = ctx.request.path.replace(/^\/d\/[^/]+\//, '/');
    const [xff, xhost] = system.getMany(['server.xff', 'server.xhost']);
    let ip = ctx.request.headers[xff?.toLowerCase() || ''] as string || ctx.request.ip;
    ip = ip.split(',')[0].trim();
    const host = ctx.request.headers[xhost?.toLowerCase() || ''] as string || ctx.request.host;
    const domainId = forceDomain?.[1] || 'system';
    const [absoluteDomain, inferDomain, bdoc] = await Promise.all([
        DomainModel.get(domainId),
        forceDomain ? Promise.resolve(null) : DomainModel.getByHost(host),
        BlackListModel.get(`ip::${ip}`),
    ]);
    if (bdoc) {
        ctx.body = 'blacklisted'; // Just return 404 if blacklisted
        return;
    }
    ctx.domainId = inferDomain?._id || domainId;
    ctx.domainInfo = inferDomain || absoluteDomain;
    if (ctx.domainInfo && ctx.domainId !== ctx.domainInfo._id) ctx.redirect(ctx.originalPath.replace(/^\/d\/[^/]+\//, `/d/${ctx.domainInfo._id}/`));
    else {
        if (!ctx.domainInfo) {
            ctx.pendingError = new NotFoundError(ctx.domainId);
            ctx.domainId = 'system';
            ctx.domainInfo = await DomainModel.get('system');
        }
        await next();
    }
};
