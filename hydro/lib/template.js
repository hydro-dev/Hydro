const path = require('path');
const nunjucks = require('nunjucks');
const markdown = require('./markdown');
const options = require('../options');
const perm = require('../permission');
const builtin = require('../model/builtin');
const model = require('../model');
const misc = require('./misc');

class Nunjucks extends nunjucks.Environment {
    constructor() {
        super(
            new nunjucks.FileSystemLoader(path.resolve(options.template.path)),
            { autoescape: true, trimBlocks: true },
        );
        this.addFilter('json', (self) => JSON.stringify(self), false);
        this.addFilter('assign', (self, data) => Object.assign(self, data));
        this.addFilter('markdown', (self) => markdown.render(self));
        this.addFilter('base64_encode', (s) => Buffer.from(s).toString('base64'));
        this.addFilter('gravatar_url', misc.gravatar_url);
        this.addFilter('format_size', misc.format_size);
        this.addGlobal('typeof', (o) => typeof o);
        this.addGlobal('console', console);
        this.addGlobal('static_url', (str) => `/${str}`);
        this.addGlobal('reverse_url', (str) => str);
        this.addGlobal('datetime_span', misc.datetime_span);
        this.addGlobal('paginate', misc.paginate);
        this.addGlobal('perm', perm);
        this.addGlobal('status', builtin.STATUS);
        this.addGlobal('model', model);
    }
}
const env = new Nunjucks();

module.exports = env;
