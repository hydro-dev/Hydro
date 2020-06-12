const { Route, Handler } = require('../service/server');
const { NotFoundError } = require('../error');

class NotFoundHandler extends Handler {
    async prepare() { // eslint-disable-line class-methods-use-this
        throw new NotFoundError();
    }
}

async function apply() {
    Route('notfound', '*', NotFoundHandler);
}

global.Hydro.handler.notfound = module.exports = apply;
