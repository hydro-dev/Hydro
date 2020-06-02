const nunjucks = require('nunjucks');
const markdown = require('./markdown');
const perm = require('../permission');
const builtin = require('../model/builtin');
const model = require('../model');
const misc = require('./misc');

function Loader() { }
Loader.prototype.getSource = function getSource(name) {
    if (!global.Hydro.template[name]) throw new Error(`Cannot get template ${name}`);
    return {
        src: global.Hydro.template[name],
        path: name,
    };
};

class Nunjucks extends nunjucks.Environment {
    constructor() {
        super(new Loader(), { autoescape: true, trimBlocks: true });
        this.addFilter('json', (self) => JSON.stringify(self), false);
        this.addFilter('assign', (self, data) => Object.assign(self, data));
        this.addFilter('markdown', (self, safe = true) => {
            if (safe) return markdown.safe.render(self);
            return markdown.unsafe.render(self);
        });
        this.addFilter('base64_encode', (s) => Buffer.from(s).toString('base64'));
    }
}
const env = new Nunjucks();

function render(name, state) {
    return new Promise((resolve, reject) => {
        env.render(name, {
            page_name: name.split('.')[0],
            ...state,
            typeof: (o) => typeof o,
            static_url: (str) => `/${str}`,
            datetimeSpan: misc.datetimeSpan,
            paginate: misc.paginate,
            perm,
            status: builtin.status,
            size: misc.size,
            gravatar: misc.gravatar,
            model,
            Context: global.Hydro.ui,
            isIE: (str) => str.includes('MSIE') || str.includes('rv:11.0'),
        }, (err, res) => {
            if (err) reject(err);
            else resolve(res);
        });
    });
}

global.Hydro.lib.template = module.exports = { render };
