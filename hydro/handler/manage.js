const domain = require('../model/domain');
const setting = require('../model/setting');
const system = require('../model/system');
const { Route, Handler } = require('../service/server');
const { PERM_MANAGE } = require('../permission');
const hpm = require('../lib/hpm');
const loader = require('../loader');
const { PermissionError } = require('../error');

class ManageHandler extends Handler {
    async prepare({ domainId }) {
        this.checkPerm(PERM_MANAGE);
        this.domain = await domain.get(domainId);
    }
}

class ManageMainHandler extends ManageHandler {
    async get() {
        this.response.redirect = '/manage/dashboard';
    }
}

class ManageDashboardHandler extends ManageHandler {
    async get() {
        const path = [
            ['Hydro', '/'],
            ['manage', '/manage'],
            ['manage_dashboard', null],
        ];
        this.response.template = 'manage_dashboard.html';
        this.response.body = { domain: this.domain, path };
    }
}

class SystemHandler extends Handler {
    async prepare() {
        if (!this.user.priv) throw new PermissionError('???');
    }
}

class SystemModuleHandler extends SystemHandler {
    async get() {
        const installed = await hpm.getInstalled();
        const path = [
            ['Hydro', '/'],
            ['manage', '/manage'],
            ['manage_module', null],
        ];
        this.response.body = { installed, active: loader.active, path };
        this.response.template = 'manage_module.html';
    }

    async postInstall({ url, id }) {
        await hpm.install(url, id);
        this.back();
    }

    async postDelete({ id }) {
        await hpm.del(id);
        this.back();
    }
}

class SystemSettingHandler extends SystemHandler {
    async get() {
        this.response.template = 'manage_settings.html';
        const current = {};
        const settings = setting.SYSTEM_SETTINGS;
        for (const s of settings) {
            current[s.key] = await system.get(s.key);
        }
        this.response.body = { current, settings };
    }

    async post(args) {
        const tasks = [];
        for (const key in args) {
            if (typeof args[key] === 'object') {
                const subtasks = [];
                for (const sub in args[key]) {
                    const s = setting.SYSTEM_SETTINGS_BY_KEY[`${key}.${sub}`];
                    if (s) {
                        if (s.ui === 'number') args[key][sub] = Number(args[key][sub]);
                        subtasks.push(system.set(`${key}.${sub}`, args[key][sub]));
                    }
                }
                tasks.push(Promise.all(subtasks));
            } else {
                const s = setting.SYSTEM_SETTINGS_BY_KEY[key];
                if (s) {
                    if (s.ui === 'number') args[key] = Number(args[key]);
                    tasks.push(system.set(key, args[key]));
                }
            }
        }
        await Promise.all(tasks);
        this.back();
    }
}

async function apply() {
    Route('/manage', module.exports.ManageMainHandler);
    Route('/manage/dashboard', module.exports.ManageDashboardHandler);
    Route('/manage/module', SystemModuleHandler);
    Route('/manage/setting', SystemSettingHandler);
}

global.Hydro.handler.manage = module.exports = {
    ManageMainHandler,
    ManageDashboardHandler,
    SystemModuleHandler,
    SystemSettingHandler,
    apply,
};
