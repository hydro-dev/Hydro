import BlackListModel from '../../model/blacklist';
import DomainModel from '../../model/domain';
import * as system from '../../model/system';
import token from '../../model/token';
import { KoaContext } from '../server';

export default async (ctx: KoaContext, next) => {
    const forceDomain = /^\/d\/([^/]+)\//.exec(ctx.request.path);
    ctx.originalPath = ctx.request.path;
    ctx.path = ctx.request.path = ctx.request.path.replace(/^\/d\/[^/]+\//, '/');
    const [xff, xhost] = system.getMany(['server.xff', 'server.xhost']);
    let ip = ctx.request.headers[xff?.toLowerCase() || ''] as string || ctx.request.ip;
    ip = ip.split(',')[0].trim();
    const host = ctx.request.headers[xhost?.toLowerCase() || ''] as string || ctx.request.host;
    const header = ctx.request.headers.authorization;
    const sid = header
        ? header.split(' ')[1] // Accept bearer token
        : ctx.cookies.get('sid') || ctx.query.sid; // FIXME maybe a better way for shared conn?
    let domainId = forceDomain?.[1] || 'system';
    const [absoluteDomain, inferDomain, bdoc, session] = await Promise.all([
        DomainModel.get(domainId),
        forceDomain ? Promise.resolve() : DomainModel.getByHost(host),
        BlackListModel.get(`ip::${ip}`),
        token.get(sid instanceof Array ? sid[0] : sid, token.TYPE_SESSION),
    ]);
    if (bdoc) {
        ctx.body = 'blacklisted'; // Just return 404 if blacklisted
        return;
    }
    if (inferDomain) domainId = inferDomain._id;
    ctx.domainId = domainId;
    ctx.domainInfo = inferDomain || absoluteDomain;
    if (domainId !== ctx.domainInfo._id) {
        // Case sensitive
        ctx.redirect(ctx.originalPath.replace(/^\/d\/[^/]+\//, `/d/${ctx.domainInfo._id}/`));
    } else {
        ctx.session = session || { uid: 0 };
        await next();
    }
};
