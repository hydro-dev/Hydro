const
    path = require('path'),
    static = require('koa-static'),
    nunjucks = require('nunjucks'),
    options = require('../options'),
    perm = require('../permission'),
    builtin = require('../model/builtin'),
    { MIDDLEWARE } = require('../service/server'),
    { NotFoundError } = require('../error');

class Nunjucks extends nunjucks.Environment {
    constructor() {
        super(
            new nunjucks.FileSystemLoader(path.resolve(options.template.path)),
            { autoescape: true, trimBlocks: true }
        );
        this.addFilter('json', function (data) {
            return JSON.stringify(data);
        }, false);
        this.addFilter('assign', function (self, data) {
            return Object.assign(self, data);
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
    ctx.ui_context = {};
    ctx.user_context = {};
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
        } catch (error) {
            await ctx.render('error.html', { error });
        }
        Object.assign(ctx.body, JSON.parse(ctx.query.data || '{}'));
        console.log(ctx.body);
        if (ctx.query.template || ctx.templateName) await ctx.render(ctx.query.template || ctx.templateName, ctx.body);
    } catch (error) {
        await ctx.render('bsod.html', { error });
    }
});