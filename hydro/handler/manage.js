const setting = require('../model/setting');
const system = require('../model/system');
const { Route, Handler } = require('../service/server');
const hpm = require('../lib/hpm');
const loader = require('../loader');
const { PermissionError } = require('../error');

class SystemHandler extends Handler {
    async prepare() {
        if (!this.user.priv) throw new PermissionError('???');
        this.response.body = {
            path: [
                ['Hydro', '/'],
                ['manage_main', '/manage'],
            ],
        };
    }
}

class SystemMainHandler extends SystemHandler {
    async get() {
        this.response.redirect = '/manage/dashboard';
    }
}

class SystemDashboardHandler extends SystemHandler {
    async get() {
        this.response.template = 'manage_dashboard.html';
        this.response.body.path.push(['manage_dashboard', null]);
    }
}

class SystemModuleHandler extends SystemHandler {
    async get() {
        this.response.body.path.push(['manage_module', null]);
        this.response.body.installed = await hpm.getInstalled();
        this.response.active = loader.active;
        this.response.template = 'manage_module.html';
    }

    async postInstall({ url }) {
        await hpm.install(url);
        this.back();
    }

    async postDelete({ id }) {
        await hpm.del(id);
        this.back();
    }
}

class SystemScriptHandler extends SystemHandler {
    async get() {
        this.response.template = 'manage_script.html';
        this.response.body.scripts = global.Hydro.script;
        this.response.body.path.push(['manage_script', null]);
    }

    async post({ id, args }) {
        // TODO Do not use console.log
        await global.Hydro.script[id].run(JSON.parse(args), console.log);
        this.back();
    }
}

class SystemSettingHandler extends SystemHandler {
    async get() {
        this.response.template = 'manage_settings.html';
        this.response.body.path.push(['manage_settings', null]);
        this.response.body.current = {};
        this.response.body.settings = setting.SYSTEM_SETTINGS;
        for (const s of this.response.body.settings) {
            this.response.body.current[s.key] = await system.get(s.key);
        }
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
    Route('/manage', SystemMainHandler);
    Route('/manage/dashboard', SystemDashboardHandler);
    Route('/manage/script', SystemScriptHandler);
    Route('/manage/module', SystemModuleHandler);
    Route('/manage/setting', SystemSettingHandler);
}

global.Hydro.handler.manage = module.exports = apply;
