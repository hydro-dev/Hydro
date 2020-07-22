import fs from 'fs';
import path from 'path';
import serialize from 'serialize-javascript';
import nunjucks from 'nunjucks';
import { argv } from 'yargs';
import * as markdown from './markdown';
import * as misc from './misc';

class Loader extends nunjucks.Loader {
    // eslint-disable-next-line class-methods-use-this
    getSource(name: string) {
        if (!argv.template) {
            if (!global.Hydro.ui.template[name]) throw new Error(`Cannot get template ${name}`);
            return {
                src: global.Hydro.ui.template[name],
                path: name,
                noCache: false,
            };
        }
        let fullpath = null;
        const p = path.resolve(argv.template as string, name);
        if (fs.existsSync(p)) fullpath = p;
        if (!fullpath) throw new Error(`Cannot get template ${name}`);
        return {
            src: fs.readFileSync(fullpath, 'utf-8').toString(),
            path: fullpath,
            noCache: true,
        };
    }
}

class Nunjucks extends nunjucks.Environment {
    constructor() {
        super(new Loader(), { autoescape: true, trimBlocks: true });
        this.addFilter('json', (self) => JSON.stringify(self), false);
        this.addFilter('serialize', (self, ignoreFunction = true) => serialize(self, { ignoreFunction }));
        this.addFilter('assign', (self, data) => Object.assign(self, data));
        this.addFilter('markdown', (self, html = false) => markdown.render(self, html));
        this.addFilter('ansi', (self) => misc.ansiToHtml(self));
        this.addFilter('base64_encode', (s) => Buffer.from(s).toString('base64'));
        this.addFilter('bitand', (self, val) => self & val);
    }
}
const env = new Nunjucks();

export async function render(name: string, state: any): Promise<string> {
    const cdnPrefix = await global.Hydro.model.system.get('server.cdn');
    return await new Promise((resolve, reject) => {
        env.render(name, {
            page_name: name.split('.')[0],
            ...state,
            typeof: (o) => typeof o,
            static_url: (assetName: string) => {
                if (global.Hydro.ui.manifest[assetName]) {
                    return `${cdnPrefix}${global.Hydro.ui.manifest[assetName]}`;
                }
                return `${cdnPrefix}${assetName}`;
            },
            datetimeSpan: misc.datetimeSpan,
            paginate: misc.paginate,
            perm: global.Hydro.model.builtin.PERM,
            PRIV: global.Hydro.model.builtin.PRIV,
            STATUS: global.Hydro.model.builtin.STATUS,
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
