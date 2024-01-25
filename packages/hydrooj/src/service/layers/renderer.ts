import { ObjectId } from 'mongodb';
import avatar from '../../lib/avatar';
import serializer from '../../lib/serializer';
import { PERM } from '../../model/builtin';
import * as system from '../../model/system';
import type { KoaContext } from '../server';

export default (router, logger) => async (ctx: KoaContext, next) => {
    const { request, response } = ctx.HydroContext;
    ctx.renderHTML = (templateName, args) => {
        const user = ctx.HydroContext.user;
        const UserContext: any = {
            ...(user || {}),
            avatar: avatar(user?.avatar || '', 128),
            viewLang: ctx.translate('__id'),
        };
        const type = templateName.split('.')[1];
        const engine = global.Hydro.module.render[type]
            || (() => JSON.stringify(args, serializer({
                showDisplayName: user?.hasPerm(PERM.PERM_VIEW_DISPLAYNAME),
            })));
        return engine(templateName, {
            handler: ctx.handler,
            UserContext,
            url: ctx.getUrl,
            _: ctx.translate,
            ...args,
        });
    };
    ctx.render = async (name, args) => {
        response.body = await ctx.renderHTML(name, args);
        response.type = 'text/html';
    };
    ctx.getUrl = (name: string, ...kwargsList: Record<string, any>[]) => {
        if (name === '#') return '#';
        let res = '#';
        const args: any = {};
        const query: any = {};
        for (const kwargs of kwargsList) {
            for (const key in kwargs) {
                if (kwargs[key] instanceof ObjectId) args[key] = kwargs[key].toHexString();
                else args[key] = kwargs[key].toString().replace(/\//g, '%2F');
            }
            for (const key in kwargs.query || {}) {
                if (query[key] instanceof ObjectId) query[key] = kwargs.query[key].toHexString();
                else query[key] = kwargs.query[key].toString();
            }
        }
        try {
            const { anchor } = args;
            let withDomainId = args.domainId || false;
            const domainId = ctx.HydroContext.args.domainId;
            const host = ctx.HydroContext.domain?.host;
            if (domainId !== 'system' && (
                !request.host
                || (host instanceof Array
                    ? (!host.includes(request.host))
                    : request.host !== host)
            )) withDomainId ||= domainId;
            res = router.url(name, args, { query }).toString();
            if (anchor) res = `${res}#${anchor}`;
            if (withDomainId) res = `/d/${withDomainId}${res}`;
        } catch (e) {
            logger.warn(e.message);
            logger.info('%s %o', name, args);
            if (!e.message.includes('Expected') || !e.message.includes('to match')) logger.info('%s', e.stack);
        }
        return res;
    };
    ctx.translate = (str: string) => {
        if (!str) return '';
        const lang = ctx.HydroContext.user?.viewLang || ctx.session?.viewLang;
        return lang
            ? str.toString().translate(lang, ...ctx.acceptsLanguages())
            : str.toString().translate(...ctx.acceptsLanguages(), system.get('server.language'));
    };
    await next();
};
