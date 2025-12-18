import { PassThrough } from 'stream';
import type { Next } from 'koa';
import {
    HydroRequest, HydroResponse, KoaContext, serializer,
} from '@hydrooj/framework';
import { errorMessage } from '@hydrooj/utils/lib/utils';
import { SystemError, UserFacingError } from './error';

const pick = <T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> => {
    const result: Partial<Pick<T, K>> = {};
    for (const key of keys) result[key] = obj[key];
    return result as Pick<T, K>;
};

export default (logger, xff, xhost) => async (ctx: KoaContext, next: Next) => {
    // Base Layer
    const request: HydroRequest = {
        method: ctx.request.method.toLowerCase(),
        host: ctx.request.headers[xhost?.toLowerCase() || ''] as string || ctx.request.host,
        ip: (ctx.request.headers[xff?.toLowerCase() || ''] as string || ctx.request.ip).split(',')[0].trim(),
        ...pick(ctx, ['cookies', 'query', 'path', 'originalPath', 'querystring']),
        ...pick(ctx.request, ['headers', 'body', 'hostname']),
        files: ctx.request.files as any,
        referer: ctx.request.headers.referer || '',
        json: (ctx.request.headers.accept || '').includes('application/json'),
        websocket: ctx.request.headers.upgrade === 'websocket',
        get params() {
            return ctx.params;
        },
    };
    const response: HydroResponse = {
        body: {},
        type: '',
        status: null,
        template: null,
        redirect: null,
        attachment: (name, streamOrBuffer) => {
            if (name) ctx.attachment(name);
            if (streamOrBuffer instanceof Buffer || streamOrBuffer instanceof PassThrough) {
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
        ...ctx.params, ...ctx.query, ...ctx.request.body, __start: Date.now(),
    };
    ctx.HydroContext = { request, response, args } as any;
    try {
        await next();
        if (request.websocket) return;
        const handler = ctx.handler;
        if (!handler) {
            logger.error('No handler found on request', request);
            ctx.response.status = 500;
            return;
        }
        const { UiContext, user } = ctx.HydroContext;
        if (response.redirect) {
            response.body ||= {};
            response.body.url = response.redirect;
        }
        if (!response.type) {
            if (response.pjax && args.pjax) {
                const pjax = typeof response.pjax === 'string' ? [[response.pjax, {}]] : response.pjax;
                response.body = {
                    fragments: (await Promise.all(
                        pjax.map(async ([template, extra]) => handler.renderHTML(template, { ...response.body, ...extra })),
                    )).map((i) => ({ html: i })),
                };
                response.type = 'application/json';
            } else if (
                request.json || response.redirect
                || request.query.noTemplate || !response.template) {
                // Send raw data
                try {
                    if (typeof response.body === 'object' && request.headers['x-hydro-inject']) {
                        const inject = request.headers['x-hydro-inject'].toString().toLowerCase().split(',').map((i) => i.trim());
                        if (inject.includes('uicontext')) response.body.UiContext = UiContext;
                        if (inject.includes('usercontext')) response.body.UserContext = user;
                    }
                    response.body = JSON.stringify(response.body, serializer(false, handler));
                } catch (e) {
                    response.body = new SystemError('Serialize failure', e.message);
                }
                response.type = 'application/json';
            } else if (response.template) {
                response.body = await handler.renderHTML(response.template, response.body || {});
                response.type = 'text/html';
            }
        }
        if (response.disposition) ctx.set('Content-Disposition', response.disposition);
        if (response.etag) {
            ctx.set('ETag', response.etag);
            ctx.set('Cache-Control', 'public');
        }
    } catch (err) {
        const error = errorMessage(err);
        response.status = error instanceof UserFacingError ? error.code : 500;
        if (request.json) response.body = { error };
        else {
            try {
                response.body = await ctx.handler.renderHTML(
                    error instanceof UserFacingError ? 'error.html' : 'bsod.html',
                    { UserFacingError, error },
                );
                response.type = 'text/html';
            } catch (e) {
                logger.error(e);
                // this.response.body.error = {};
            }
        }
    } finally {
        if (!request.websocket) {
            if (response.etag && request.headers['if-none-match'] === response.etag) {
                ctx.response.status = 304;
            } else if (response.redirect && !request.json) {
                ctx.response.type = 'application/octet-stream';
                ctx.response.status = 302;
                ctx.redirect(response.redirect);
            } else if (response.body) {
                ctx.body = response.body instanceof Blob ? Buffer.from(await response.body.arrayBuffer()) : response.body;
                ctx.response.status = response.status || 200;
                ctx.response.type = response.type
                    || (request.json
                        ? 'application/json'
                        : ctx.response.type);
            }
        }
    }
};
