const domain = require('../model/domain');
const system = require('../model/system');
const setting = require('../model/setting');
const { Route, Handler } = require('../service/server');
const { PERM_MANAGE } = require('../permission');
const hpm = require('../lib/hpm');
const loader = require('../loader');

class SystemHandler extends Handler {
    async prepare({ domainId }) {
        this.checkPerm(PERM_MANAGE);
        this.domain = await domain.get(domainId);
    }
}

class SystemDashboardHandler extends SystemHandler {
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
        this.response.body = {
            current, settings,
        };
    }

    async post(args) {
        const tasks = [];
        for (const key in args) {
            if (typeof args[key] === 'object') {
                const subtasks = [];
                for (const sub in args[key]) {
                    subtasks.push(system.set(`${key}.${sub}`, args[key][sub]));
                }
                tasks.push(Promise.all(subtasks));
            } else tasks.push(system.set(key, args[key]));
        }
        await Promise.all(tasks);
        this.back();
    }
}

async function apply() {
    Route('/system', SystemDashboardHandler);
    Route('/system/module', SystemModuleHandler);
    Route('/system/setting', SystemSettingHandler);
}

global.Hydro.handler.manage = module.exports = apply;
