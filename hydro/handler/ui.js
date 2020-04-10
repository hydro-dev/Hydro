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
function* paginate(page, num_pages) {
    let radius = 2, first, last;
    if (page > 1) {
        yield ['first', 1];
        yield ['previous', page - 1];
    }
    if (page <= radius) [first, last] = [1, Math.min(1 + radius * 2, num_pages)];
    else if (page >= num_pages - radius) [first, last] = [Math.max(1, num_pages - radius * 2), num_pages];
    else[first, last] = [page - radius, page + radius];
    if (first > 1) yield ['ellipsis', 0];
    for (let page0 = first; page0 < last + 1; page0++) {
        if (page0 != page) yield ['page', page0];
        else yield ['current', page];
    }
    if (last < num_pages) yield ['ellipsis', 0];
    if (page < num_pages) yield ['next', page + 1];
    yield ['last', num_pages];
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
        this.addGlobal('paginate', paginate);
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