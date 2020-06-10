const { Route, Handler } = global.Hydro.service.server;
const { NotFoundError } = global.Hydro.error;
// eslint-disable-next-line import/no-unresolved
const pages = require('./__build.json');

class WikiHandler extends Handler {
    async get({ name }) {
        if (!pages[name]) throw new NotFoundError(name);
        const contents = pages[name];
        const path = [
            ['Hydro', '/'],
            ['wiki', '/wiki'],
            [`wiki_${name}`, null],
        ];
        this.response.body = {
            path, contents, page_name: `wiki_${name}`,
        };
        this.response.template = 'wiki.html';
    }
}

async function apply() {
    Route('/wiki/:name', WikiHandler);
}

global.Hydro.handler.wiki = module.exports = apply;
