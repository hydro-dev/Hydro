const file = require('../model/file');
const { Route, Handler } = require('../service/server');

class FileDownloadHandler extends Handler {
    async get({ id, secret, name }) {
        if (name) name = Buffer.from(name, 'base64').toString();
        this.response.attachment(name || id);
        this.response.body = await file.get(id, secret);
    }
}

async function apply() {
    Route('/fs/:id/:secret', module.exports.FileDownloadHandler);
    Route('/fs/:id/:name/:secret', module.exports.FileDownloadHandler);
}

global.Hydro.handler.file = module.exports = {
    FileDownloadHandler,
    apply,
};
