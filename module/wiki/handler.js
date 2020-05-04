const { Route, Handler } = global.Hydro.service.server;

class WikiHelpHandler extends Handler {
    async get() {
        const path = [
            ['Hydro', '/'],
            ['wiki', '/wiki'],
            ['wiki_help', null],
        ];
        this.response.body = { path };
        this.response.template = 'wiki_help.html';
    }
}

class WikiAboutHandler extends Handler {
    async get() {
        const path = [
            ['Hydro', '/'],
            ['wiki', '/wiki'],
            ['wiki_about', null],
        ];
        this.response.body = { path };
        this.response.template = 'wiki_about.html';
    }
}

async function apply() {
    Route('/wiki/help', module.exports.WikiHelpHandler);
    Route('/wiki/about', module.exports.WikiAboutHandler);
}

global.Hydro.handler.wiki = module.exports = {
    WikiHelpHandler, WikiAboutHandler, apply,
};
