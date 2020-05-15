const { Route, Handler } = global.Hydro.service.server;
const { PERM_MANAGE } = global.Hydro.permission;
const { message } = global.Hydro.model;
const migrate = global.Hydro.script.migrateVijos;

class MigrateVijosHandler extends Handler {
    async prepare() {
        this.checkPerm(PERM_MANAGE);
    }

    async get() {
        const path = [
            ['Hydro', '/'],
            ['migrate_vijos', null],
        ];
        this.response.body = { path };
        this.response.template = 'migrate_vijos.html';
    }

    async post({
        host, port, name, username, password,
    }) {
        migrate({
            host, port, name, username, password,
        }, (data) => message.send(1, 1, data));
        this.response.redirect = '/manage/log';
    }
}

async function apply() {
    Route('/migrate/vijos', module.exports.MigrateVijosHandler);
}

global.Hydro.handler.pastebin = module.exports = {
    MigrateVijosHandler, apply,
};
