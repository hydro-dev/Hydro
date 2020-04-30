const { Route, Handler } = require('../service/server');
const { NotFoundError } = require('../error');

class NotFoundHandler extends Handler {
    async prepare() {
        throw new NotFoundError();
    }
}

async function apply() {
    Route('/:param1', module.exports.NotFoundHandler);
    Route('/:param1/:param2', module.exports.NotFoundHandler);
    Route('/:param1/:param2/:param3', module.exports.NotFoundHandler);
    Route('/:param1/:param2/:param3/:param4', module.exports.NotFoundHandler);
}

global.Hydro.handler.notfound = module.exports = {
    NotFoundHandler, apply,
};
