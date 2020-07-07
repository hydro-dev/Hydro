import nunjucks from 'nunjucks';
import * as markdown from './markdown';
import { STATUS, PERM, PRIV } from '../model/builtin';
import * as misc from './misc';

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
        this.addFilter('ansi', (self) => misc.ansiToHtml(self));
        this.addFilter('base64_encode', (s) => Buffer.from(s).toString('base64'));
        this.addFilter('bitand', (self, val) => self & val);
    }
}
const env = new Nunjucks();

export function render(name: string, state: any): Promise<string> {
    return new Promise((resolve, reject) => {
        env.render(name, {
            page_name: name.split('.')[0],
            ...state,
            typeof: (o) => typeof o,
            static_url: (str) => `/${str}`,
            datetimeSpan: misc.datetimeSpan,
            paginate: misc.paginate,
            perm: PERM,
            PRIV,
            STATUS,
            size: misc.size,
            gravatar: misc.gravatar,
            model: global.Hydro.model,
            Context: global.Hydro.ui,
            isIE: (str: string) => str.includes('MSIE') || str.includes('rv:11.0'),
        }, (err, res) => {
            if (err) reject(err);
            else resolve(res);
        });
    });
}

global.Hydro.lib.template = { render };
