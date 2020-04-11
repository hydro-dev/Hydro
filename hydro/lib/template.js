const
    path = require('path'),
    nunjucks = require('nunjucks'),
    markdown = require('./markdown'),
    options = require('../options'),
    perm = require('../permission'),
    builtin = require('../model/builtin'),
    model = require('../model'),
    misc = require('../lib/misc');

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
            return markdown.render(self);
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
        this.addGlobal('status', builtin.STATUS);
        this.addGlobal('model', model);
    }
}
let env = new Nunjucks();

module.exports = env;