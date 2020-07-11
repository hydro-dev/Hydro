import fs from 'fs';
import path from 'path';
import nunjucks from 'nunjucks';
import * as markdown from './markdown';
import { STATUS, PERM, PRIV } from '../model/builtin';
import * as misc from './misc';

class Loader extends nunjucks.Loader {
    // eslint-disable-next-line class-methods-use-this
    getSource(name: string) {
        if (!process.env.debug) {
            if (!global.Hydro.template[name]) throw new Error(`Cannot get template ${name}`);
            return {
                src: global.Hydro.template[name],
                path: name,
                noCache: false,
            };
        }
        let fullpath = null;
        const base = path.join(process.cwd(), 'templates');
        const p = path.resolve(base, name);
        if (fs.existsSync(p)) fullpath = p;
        if (!fullpath) throw new Error(`Cannot get template ${name}`);
        return {
            src: fs.readFileSync(fullpath, 'utf-8'),
            path: fullpath,
            noCache: true,
        };
    }
}

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
