import { ObjectID } from 'mongodb';
import avatar from 'hydrooj/src/lib/avatar';
import { PERM } from 'hydrooj/src/model/builtin';
import * as system from 'hydrooj/src/model/system';
import { User } from 'hydrooj/src/model/user';
import type { KoaContext } from '../server';

function serializer(showDisplayName: boolean) {
    return (k: string, v: any) => {
        if (k.startsWith('_') && k !== '_id') return undefined;
        if (typeof v === 'bigint') return `BigInt::${v.toString()}`;
        if (v instanceof User && !showDisplayName) delete v.displayName;
        return v;
    };
}

export default (router, logger) => async (ctx: KoaContext, next) => {
    const { request, response } = ctx.HydroContext;
    ctx.renderHTML = (templateName, args) => {
        const UserContext: any = {
            ...(ctx.HydroContext.user || {}),
            avatar: avatar(ctx.HydroContext.user?.avatar || '', 128),
            viewLang: ctx.translate('__id'),
        };
        const engine = global.Hydro.lib.template?.render
        || (() => JSON.stringify(args, serializer(ctx.HydroContext.user.hasPerm(PERM.PREM_VIEW_DISPLAYNAME) || false)));
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
    ctx.getUrl = (name: string, kwargs: any = {}) => {
        let res = '#';
        const args: any = {};
        const query: any = {};
        for (const key in kwargs) {
            if (kwargs[key] instanceof ObjectID) args[key] = kwargs[key].toHexString();
            else args[key] = kwargs[key].toString().replace(/\//g, '%2F');
        }
        for (const key in kwargs.query || {}) {
            if (query[key] instanceof ObjectID) query[key] = kwargs.query[key].toHexString();
            else query[key] = kwargs.query[key].toString();
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
