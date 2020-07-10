import { NotFoundError } from '../error';
import {
    Route, Handler, Types, param,
} from '../service/server';

class WikiHandler extends Handler {
    @param('category', Types.String, true)
    @param('page', Types.String)
    async get(domainId: string, category = 'wiki', page: string) {
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

export async function apply() {
    Route('wiki', '/wiki/:page', WikiHandler);
    Route('wiki_with_category', '/wiki/:category/:page', WikiHandler);
}

global.Hydro.handler.wiki = apply;
