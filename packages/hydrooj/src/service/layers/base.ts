import { PassThrough } from 'stream';
import { cloneDeep } from 'lodash';
import * as system from '../../model/system';
import token from '../../model/token';
import type { HydroRequest, HydroResponse } from '../server';

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

export default async (ctx, next) => {
    // Base Layer
    const { domainId, domainInfo } = ctx;
    const isWebsocket = ctx.request.headers.upgrade === 'websocket';
    const [xff, xhost] = system.getMany(['server.xff', 'server.xhost']);
    // ignore reverse_proxy chains
    const ipHeader = ctx.request.headers[xff?.toLowerCase() || ''] || ctx.request.ip;
    const ip = (typeof ipHeader === 'string' ? ipHeader : ipHeader[0]).split(',')[0].trim();
    const host = ctx.request.headers[xhost?.toLowerCase() || ''] as string || ctx.request.host;
    const request: HydroRequest = {
        method: ctx.request.method.toLowerCase(),
        host,
        hostname: ctx.request.hostname,
        ip,
        headers: ctx.request.headers,
        cookies: ctx.cookies,
        body: ctx.request.body,
        files: ctx.request.files as any,
        query: ctx.query,
        querystring: ctx.querystring,
        path: ctx.path,
        originalPath: ctx.originalPath,
        params: ctx.params,
        referer: ctx.request.headers.referer || '',
        json: (ctx.request.headers.accept || '').includes('application/json'),
        websocket: isWebsocket,
    };
    const response: HydroResponse = {
        body: {},
        type: '',
        status: null,
        template: null,
        redirect: null,
        attachment: (name, streamOrBuffer) => {
            ctx.attachment(name);
            if (streamOrBuffer instanceof Buffer) {
                response.body = null;
                ctx.body = streamOrBuffer;
            } else {
                response.body = null;
                ctx.body = streamOrBuffer.pipe(new PassThrough());
            }
        },
        addHeader: (name: string, value: string) => ctx.set(name, value),
        disposition: null,
    };
    const args = {
        domainId, ...ctx.params, ...ctx.query, ...ctx.request.body, __start: Date.now(),
    };
    const UiContext: any = cloneDeep(UiContextBase);
    if (!process.env.DEV) UiContext.cdn_prefix = system.get('server.cdn');
    if (!process.env.DEV) UiContext.ws_prefix = system.get('server.ws');
    UiContext.domainId = domainId;
    UiContext.domain = domainInfo;
    ctx.HydroContext = {
        request, response, UiContext, domain: domainInfo, user: null, args,
    };
    await next();
    const ua = request.headers['user-agent'] || '';
    if (!ctx.session.uid && system.get('server.ignoreUA').replace(/\r/g, '').split('\n').filter((i) => i && ua.includes(i)).length) return;
    const expireSeconds = ctx.session.save
        ? system.get('session.saved_expire_seconds')
        : system.get('session.unsaved_expire_seconds');
    Object.assign(ctx.session, { updateIp: ip, updateUa: ua });
    if (ctx.session._id) {
        await token.update(ctx.session._id, token.TYPE_SESSION, expireSeconds, ctx.session);
    } else {
        Object.assign(ctx.session, { createIp: ip, createUa: ua, createHost: host });
        [ctx.session._id] = await token.add(token.TYPE_SESSION, expireSeconds, ctx.session);
    }
    if (!request.websocket) {
        ctx.cookies.set('sid', ctx.session._id, {
            expires: new Date(Date.now() + expireSeconds * 1000),
            secure: !!system.get('session.secure'),
            httpOnly: false,
        });
    }
};
