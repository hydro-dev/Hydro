const { Route, Handler } = require('../service/server');

class HomeHandler extends Handler {
    async get() {
        this.response.body = {};
    }
}

Route('/', HomeHandler);
