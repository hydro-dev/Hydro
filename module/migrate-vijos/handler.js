const {
    Route, Connection, Handler, ConnectionHandler,
} = global.Hydro.service.server;
const { PERM_MANAGE } = global.Hydro.permission;
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
}

class MigrateVijosConnectionHandler extends ConnectionHandler {
    async prepare() {
        this.checkPerm(PERM_MANAGE);
    }

    async message(msg) {
        if (msg.key === 'start') {
            migrate(msg, (data) => { this.send(data); });
        }
    }
}

async function apply() {
    Route('/migrate/vijos', module.exports.MigrateVijosHandler);
    Connection('/migrate/vijos-conn', module.exports.MigrateVijosConnectionHandler);
}

global.Hydro.handler.pastebin = module.exports = {
    MigrateVijosHandler, MigrateVijosConnectionHandler, apply,
};
