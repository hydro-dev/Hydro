const { Route, Handler } = require('../service/server');
const { NotFoundError } = require('../error');

class NotFoundHandler extends Handler {
    async prepare() { // eslint-disable-line class-methods-use-this
        throw new NotFoundError();
    }
}

async function apply() {
    Route('/:param1', NotFoundHandler);
    Route('/:param1/:param2', NotFoundHandler);
    Route('/:param1/:param2/:param3', NotFoundHandler);
    Route('/:param1/:param2/:param3/:param4', NotFoundHandler);
    Route('/:param1/:param2/:param3/:param4/:param5', NotFoundHandler);
    Route('/:param1/:param2/:param3/:param4/:param5/:param6', NotFoundHandler);
}

global.Hydro.handler.notfound = module.exports = apply;
