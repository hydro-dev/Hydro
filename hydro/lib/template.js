const nunjucks = require('nunjucks');
const markdown = require('./markdown');
const perm = require('../permission');
const builtin = require('../model/builtin');
const model = require('../model');
const misc = require('./misc');

function Loader() { }
Loader.prototype.getSource = function getSource(name) {
    if (!global.Hydro.template[name]) throw new Error();
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
        this.addFilter('markdown', (self) => markdown.render(self));
        this.addFilter('base64_encode', (s) => Buffer.from(s).toString('base64'));
    }
}
const env = new Nunjucks();

module.exports = {
    render(name, state) {
        Object.assign(state, {
            typeof: (o) => typeof o,
            static_url: (str) => `/${str}`,
            datetime_span: misc.datetime_span,
            paginate: misc.paginate,
            perm,
            status: builtin.status,
            size: misc.size,
            gravatar: misc.gravatar,
            model,
            Context: global.Hydro.ui,
            isIE: (str) => str.includes('MSIE') || str.includes('rv:11.0'),
        });
        return new Promise((resolve, reject) => {
            env.render(name, state, (err, res) => {
                if (err) reject(err);
                else resolve(res);
            });
        });
    },
};
