const
    path = require('path'),
    staticCache = require('koa-static-cache'),
    nunjucks = require('nunjucks'),
    hljs = require('highlight.js'),
    MarkdownIt = require('markdown-it'),
    katex = require('markdown-it-katex'),
    options = require('../options'),
    perm = require('../permission'),
    builtin = require('../model/builtin'),
    misc=require('../lib/misc'),
    { MIDDLEWARE } = require('../service/server'),
    { NotFoundError } = require('../error');

class Markdown extends MarkdownIt {
    constructor() {
        super({
            linkify: true,
            highlight: function (str, lang) {
                if (lang && hljs.getLanguage(lang))
                    try {
                        return hljs.highlight(lang, str).value;
                    } catch (__) { } // eslint-disable-line no-empty
                return '';
            }
        });
        this.linkify.tlds('.py', false);
        this.use(katex);
    }
}
const md = new Markdown();
class Nunjucks extends nunjucks.Environment {
    constructor() {
        super(
            new nunjucks.FileSystemLoader(path.resolve(options.template.path)),
            { autoescape: true, trimBlocks: true }
        );
        this.addFilter('json', function (self) {
            return JSON.stringify(self);
        }, false);
        this.addFilter('assign', function (self, data) {
            return Object.assign(self, data);
        });
        this.addFilter('markdown', function (self) {
            return md.render(self);
        });
        this.addFilter('gravatar_url', misc.gravatar_url);
        this.addFilter('format_size', misc.format_size);
        this.addGlobal('typeof', o => typeof o);
        this.addGlobal('console', console);
        this.addGlobal('static_url', str => `/${str}`);
        this.addGlobal('reverse_url', str => str);
        this.addGlobal('datetime_span', misc.datetime_span);
        this.addGlobal('paginate', misc.paginate);
        this.addGlobal('perm', perm);
        this.addGlobal('builtin', builtin);
        this.addGlobal('status', builtin.STATUS);
    }
}
let env = new Nunjucks();
MIDDLEWARE(staticCache(path.join(process.cwd(), '.uibuild'), {
    maxAge: 365 * 24 * 60 * 60
}));
MIDDLEWARE(async (ctx, next) => {
    ctx.render_title = str => str;
    ctx.UIContext = {
        cdn_prefix: '/',
        url_prefix: '/'
    };
    ctx.preferJson = (ctx.request.headers['accept'] || '').includes('application/json');
    ctx.renderHTML = (name, context) => {
        ctx.user = ctx.state.user;
        ctx.translate = str => {
            if (!str) return '';
            return str.toString().translate(ctx.state.user.language);
        };
        ctx.has_perm = perm => ctx.state.user.hasPerm(perm);
        return new Promise((resolve, reject) => {
            env.render(name, Object.assign(ctx.state, context, {
                handler: ctx,
                _: ctx.translate,
                user: ctx.state.user
            }), (error, res) => {
                if (error) reject(error);
                else resolve(res);
            });
        });
    };
    ctx.render = async (name, context) => {
        ctx.body = await ctx.renderHTML(name, context);
        ctx.response.type = 'text/html';
    };
    try {
        try {
            await next();
            if (ctx.setRedirect) {
                ctx.response.type = 'application/octet-stream';
                ctx.redirect(ctx.setRedirect);
            } else if (ctx.body || ctx.templateName) {
                if (ctx.query.noTemplate || ctx.preferJson) return;
                if (ctx.query.template || ctx.templateName) {
                    ctx.body = ctx.body || {};
                    Object.assign(ctx.body, JSON.parse(ctx.query.data || '{}'));
                    await ctx.render(ctx.query.template || ctx.templateName, ctx.body);
                }
            } else {
                throw new NotFoundError();
            }
        } catch (e) {
            let error;
            if (ctx.body && ctx.body.error) error = ctx.body.error;
            else error = e;
            if (error instanceof NotFoundError) ctx.status = 404;
            if (error.toString().startsWith('NotFoundError')) console.log(error);
            if (error.toString().startsWith('Template render error')) throw error;
            if (ctx.preferJson) ctx.body = { error };
            else await ctx.render('error.html', { error });
        }
    } catch (error) {
        if (ctx.preferJson) ctx.body = { error };
        else await ctx.render('bsod.html', { error });
    }
}, true);