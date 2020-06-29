const { Route, Handler } = global.Hydro.service.server;
const { PRIV: { PRIV_USER_PROFILE } } = global.Hydro.model.builtin;
const { pastebin } = global.Hydro.model;
const { nav } = global.Hydro.lib;

class PasteMainHandler extends Handler {
    async get() {
        this.response.redirect = this.url('paste_create');
    }
}

class PasteShowHandler extends Handler {
    async get({ docId }) {
        const doc = await pastebin.get(docId);
        const path = [
            ['Hydro', 'homepage'],
            ['paste_show', null],
            [doc.title, null, true],
        ];
        this.response.body = { path, doc };
        this.response.template = 'paste_show.html';
    }
}

class PasteCreateHandler extends Handler {
    async get() {
        const path = [
            ['Hydro', 'homepage'],
            ['paste_create', null],
        ];
        this.response.body = { path };
        this.response.template = 'paste_create.html';
    }

    async post({
        language, expire, password, title, content,
    }) {
        const docId = await pastebin.add({
            language, expire, password, owner: this.user._id, title, content,
        });
        this.response.body = { docId };
        this.response.redirect = `/paste/${docId}`;
    }
}

async function apply() {
    Route('pastebin', '/paste', PasteMainHandler);
    Route('paste_create', '/paste/create', PasteCreateHandler, PRIV_USER_PROFILE);
    Route('paste_show', '/paste/:docId', PasteShowHandler);
    nav('pastebin', null, 'pastebin', PRIV_USER_PROFILE);
}

global.Hydro.handler.pastebin = module.exports = apply;
