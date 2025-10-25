import type { Next } from 'koa';
import { cloneDeep, omit } from 'lodash';
import type { KoaContext } from '@hydrooj/framework';
import { randomPick, Time } from '@hydrooj/utils';
import { PERM } from '../../model/builtin';
import system from '../../model/system';
import token from '../../model/token';

export interface UiContextBase {
    cdn_prefix: string;
    url_prefix: string;
    ws_prefix: string;
}
export const UiContextBase: UiContextBase = {
    cdn_prefix: '/',
    url_prefix: '/',
    ws_prefix: '/',
};

export default async (ctx: KoaContext, next: Next) => {
    // Base Layer
    const { domainId, domainInfo } = ctx;
    const args = {
        domainId, ...ctx.params, ...ctx.query, ...ctx.request.body, __start: Date.now(),
    };
    const UiContext: any = cloneDeep(UiContextBase);
    if (!process.env.DEV) {
        UiContext.cdn_prefix = system.get('server.cdn');
        if (UiContext.cdn_prefix.includes(',')) UiContext.cdn_prefix = randomPick(UiContext.cdn_prefix.split(','));
        UiContext.ws_prefix = system.get('server.ws');
        if (UiContext.ws_prefix.includes(',')) UiContext.ws_prefix = randomPick(UiContext.ws_prefix.split(','));
    }
    UiContext.domainId = domainId;
    UiContext.domain = domainInfo;
    ctx.HydroContext.UiContext = UiContext;
    ctx.HydroContext.domain = domainInfo;
    ctx.HydroContext.args = args;
    const header = ctx.request.headers.authorization;
    const sid = header
        ? header.split(' ')[1] // Accept bearer token
        : ctx.cookies.get('sid') || ctx.query.sid; // FIXME maybe a better way for shared conn?
    const session = sid ? await token.get(sid instanceof Array ? sid[0] : sid, token.TYPE_SESSION) : null;
    ctx.session = Object.create(session || { uid: 0, scope: PERM.PERM_ALL.toString() });
    await next();
    const request = ctx.HydroContext.request;
    const ua = request.headers['user-agent'] || '';
    if (!ctx.session.uid && system.get('server.ignoreUA').replace(/\r/g, '').split('\n').filter((i) => i && ua.includes(i)).length) return;
    const expireSeconds = ctx.session.save
        ? system.get('session.saved_expire_seconds')
        : system.get('session.unsaved_expire_seconds');
    const isRecent = ctx.session.updateAt ? Date.now() - new Date(ctx.session.updateAt).getTime() < 5 * Time.minute : true;
    if (!Object.getOwnPropertyNames(ctx.session).length && isRecent) return;
    Object.assign(ctx.session, { updateIp: request.ip, updateUa: ua });
    if (ctx.session._id && !ctx.session.recreate) {
        await token.update(ctx.session._id, token.TYPE_SESSION, expireSeconds, omit(ctx.session, ['_id', 'recreate']));
    } else {
        Object.assign(ctx.session, { createIp: request.ip, createUa: ua, createHost: request.host });
        [ctx.session._id] = await token.add(token.TYPE_SESSION, expireSeconds, omit(ctx.session, ['_id', 'recreate']));
    }
    if (!request.websocket) {
        const options: any = {
            expires: new Date(Date.now() + expireSeconds * 1000),
            httpOnly: false,
        };
        if (system.get('session.domain') && ctx.request.secure && ctx.request.host.endsWith(system.get('session.domain'))) {
            options.domain = system.get('session.domain');
            options.sameSite = 'none';
            options.secure = true;
        }
        ctx.cookies.set('sid', ctx.session._id, options);
    }
};
