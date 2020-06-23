const { Route, Handler } = require('../service/server');
const { NotFoundError } = require('../error');

class WikiHandler extends Handler {
    async get({ category = 'wiki', page }) {
        if (!global.Hydro.wiki[category]) throw new NotFoundError(category);
        if (!global.Hydro.wiki[category][page]) throw new NotFoundError(category, page);
        const contents = global.Hydro.wiki[category][page];
        const path = [
            ['Hydro', 'homepage'],
            [`wiki_${category}`, null],
            [`wiki_${category}_${page}`, null],
        ];
        this.response.body = {
            path, contents, page_name: `wiki_${category}_${page}`,
        };
        this.response.template = 'wiki.html';
    }
}

async function apply() {
    Route('wiki', '/wiki/:page', WikiHandler);
    Route('wiki_with_category', '/wiki/:category/:page', WikiHandler);
}

global.Hydro.handler.wiki = module.exports = apply;
