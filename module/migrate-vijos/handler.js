const { Route, Handler } = global.Hydro.service.server;
const { PERM_MANAGE } = global.Hydro.permission;
const { message } = global.Hydro.model;

class MigrateVijosHandler extends Handler {
    async prepare() {
        this.checkPerm(PERM_MANAGE);
    }

    async get() {
        const path = [
            ['Hydro', 'homepage'],
            ['migrate_vijos', null],
        ];
        this.response.body = { path };
        this.response.template = 'migrate_vijos.html';
    }

    async post({
        host, port, name, username, password,
    }) {
        global.Hydro.script.migrateVijos({
            host, port, name, username, password,
        }, (data) => message.send(1, 1, data));
        this.response.redirect = '/manage/log';
    }
}

async function apply() {
    Route('migrate_vijos', '/migrate/vijos', MigrateVijosHandler);
}

global.Hydro.handler.migrateVijos = module.exports = apply;
