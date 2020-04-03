const
    path = require('path'),
    md5 = require('blueimp-md5'),
    static = require('koa-static'),
    nunjucks = require('nunjucks'),
    hljs = require('hljs'),
    MarkdownIt = require('markdown-it'),
    katex = require('markdown-it-katex'),
    options = require('../options'),
    perm = require('../permission'),
    builtin = require('../model/builtin'),
    { MIDDLEWARE } = require('../service/server'),
    { NotFoundError } = require('../error'),
    MD5_REGEX = /^[0-9a-f]{32}$/;

function getHash(email) {
    email = (typeof email === 'string') ? email.trim().toLowerCase() : 'unspecified';
    return email.match(MD5_REGEX) ? email : md5(email);
}

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
        this.addFilter('gravatar_url', function (email, size) {
            return `//gravatar.loli.net/avatar/${getHash(email)}?d=mm&s=${size}`;
        });
        this.addGlobal('static_url', str => `/${str}`);
        this.addGlobal('reverse_url', str => str);
        this.addGlobal('perm', perm);
        this.addGlobal('builtin', builtin);
    }
}
const env = new Nunjucks();
MIDDLEWARE(static(path.resolve(process.cwd(), '.uibuild')));
MIDDLEWARE(async (ctx, next) => {
    ctx.render_title = str => str;
    ctx.UIContext = {
        cdn_prefix: '/',
        url_prefix: '/'
    };
    ctx.render = async (name, context) => {
        ctx.user = ctx.state.user;
        ctx.translate = str => {
            return str.translate(ctx.state.user.language);
        };
        ctx.has_perm = perm => ctx.state.user.hasPerm(perm);
        ctx.body = await new Promise((resolve, reject) => {
            env.render(name, Object.assign(ctx.state, context, {
                handler: ctx,
                _: ctx.translate
            }), (error, res) => {
                if (error) reject(error);
                else resolve(res);
            });
        });
        ctx.response.type = 'text/html';
    };
    try {
        try {
            await next();
            if (!ctx.body) throw new NotFoundError();
            if (ctx.query.template || ctx.templateName) {
                Object.assign(ctx.body, JSON.parse(ctx.query.data || '{}'));
                await ctx.render(ctx.query.template || ctx.templateName, ctx.body);
            } else if (ctx.setRedirect) {
                ctx.response.type = 'application/octet-stream';
                ctx.redirect(ctx.setRedirect);
            }
        } catch (error) {
            if (error.toString().startsWith('Template render error')) throw error;
            await ctx.render('error.html', { error });
        }
    } catch (error) {
        await ctx.render('bsod.html', { error });
    }
});