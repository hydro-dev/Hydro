const { Route, Handler } = require('../service/server');
const { NotFoundError } = require('../error');

class WikiHandler extends Handler {
    async get({ name }) {
        if (!global.Hydro.wiki[name]) throw new NotFoundError(name);
        const contents = global.Hydro.wiki[name];
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
