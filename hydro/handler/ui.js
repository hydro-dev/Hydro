const
    path = require('path'),
    send = require('koa-send'),
    nunjucks = require('nunjucks'),
    hljs = require('highlight.js'),
    MarkdownIt = require('markdown-it'),
    katex = require('markdown-it-katex'),
    options = require('../options'),
    perm = require('../permission'),
    builtin = require('../model/builtin'),
    md5 = require('../lib/md5'),
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
function datetime_span(dt, { relative = true } = {}) {
    if (dt.generationTime) dt = new Date(dt.generationTime * 1000);
    else if (typeof dt == 'number' || typeof dt == 'string') dt = new Date(dt);
    return '<span class="time{0}" data-timestamp="{1}">{2}</span>'.format(
        relative ? ' relative' : '',
        dt.getTime() / 1000,
        dt.toLocaleString()
    );
}
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
            return `//gravatar.loli.net/avatar/${md5(email.toString().trim().toLowerCase())}?d=mm&s=${size}`;
        });
        this.addFilter('format_size', function (size, base = 1) {
            size *= base;
            let unit = 1024;
            let unit_names = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
            for (let unit_name of unit_names) {
                if (size < unit) return '{0} {1}'.format(Math.round(size), unit_name);
                size /= unit;
            }
            return '{0} {1}'.format(Math.round(size * unit), unit_names[unit_names.length - 1]);
        });
        this.addGlobal('typeof', o => typeof o);
        this.addGlobal('console', console);
        this.addGlobal('static_url', str => `/${str}`);
        this.addGlobal('reverse_url', str => str);
        this.addGlobal('datetime_span', datetime_span);
        this.addGlobal('perm', perm);
        this.addGlobal('builtin', builtin);
        this.addGlobal('status', builtin.STATUS);
    }
}
let env = new Nunjucks();
MIDDLEWARE(async (ctx, next) => {
    let done = false;
    if (ctx.method === 'HEAD' || ctx.method === 'GET')
        try {
            done = await send(ctx, ctx.path, { root: path.resolve(process.cwd(), '.uibuild'), index: 'index.html' });
        } catch (err) {
            if (err.status !== 404) throw err;
        }
    if (!done) await next();
});
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
            if (ctx.body || ctx.templateName) {
                if (ctx.preferJson) return;
                if (ctx.query.template || ctx.templateName) {
                    ctx.body = ctx.body || {};
                    Object.assign(ctx.body, JSON.parse(ctx.query.data || '{}'));
                    await ctx.render(ctx.query.template || ctx.templateName, ctx.body);
                } else if (ctx.setRedirect) {
                    ctx.response.type = 'application/octet-stream';
                    ctx.redirect(ctx.setRedirect);
                }
            } else {
                throw new NotFoundError();
            }
        } catch (error) {
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