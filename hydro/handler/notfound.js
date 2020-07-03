/* eslint-disable no-empty-function */
/* eslint-disable class-methods-use-this */
const { Route, Handler } = require('../service/server');
const { NotFoundError } = require('../error');

class NotFoundHandler extends Handler {
    async prepare() {
        throw new NotFoundError();
    }

    async get() { }

    async post() { }
}

async function apply() {
    Route('notfound', '*', NotFoundHandler);
}

global.Hydro.handler.notfound = module.exports = apply;
