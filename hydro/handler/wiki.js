const { Route, Handler } = require('../service/server');
const { NotFoundError } = require('../error');

class WikiHandler extends Handler {
    async get({ name: page }) {
        if (!global.Hydro.wiki[page]) throw new NotFoundError(page);
        const contents = global.Hydro.wiki[page];
        const path = [
            ['Hydro', '/'],
            ['wiki', '/wiki'],
            [`wiki_${page}`, null],
        ];
        this.response.body = {
            path, contents, page_name: `wiki_${page}`,
        };
        this.response.template = 'wiki.html';
    }
}

async function apply() {
    Route('wiki', '/wiki/:page', WikiHandler);
}

global.Hydro.handler.wiki = module.exports = apply;
