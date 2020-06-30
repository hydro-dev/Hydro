const setting = require('../model/setting');
const system = require('../model/system');
const { STATUS, PRIV } = require('../model/builtin');
const record = require('../model/record');
const judge = require('./judge');
const { Route, Handler } = require('../service/server');
const hpm = require('../lib/hpm');
const loader = require('../loader');

class SystemHandler extends Handler {
    async prepare() {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        this.response.body = {
            path: [
                ['Hydro', 'homepage'],
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

    async postRestart() {
        const count = await system.get('server.worker');
        process.send({ event: 'restart', count });
        this.back();
    }
}

class SystemModuleHandler extends SystemHandler {
    async get() {
        this.response.body.path.push(['manage_module', null]);
        this.response.body.installed = await hpm.getDetail();
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

    async post({ domainId, id, args = '{}' }) {
        args = JSON.parse(args);
        const rid = await record.add(domainId, {
            pid: id,
            uid: this.user._id,
            lang: null,
            code: null,
            status: STATUS.STATUS_JUDGING,
            hidden: true,
        }, false);
        async function report(data) {
            judge.next({ domainId, rid, ...data });
        }
        setTimeout(() => {
            const start = new Date().getTime();
            global.Hydro.script[id].run(args, report)
                .then((ret) => {
                    const time = new Date().getTime() - start;
                    judge.end({
                        domainId,
                        rid,
                        status: STATUS.STATUS_ACCEPTED,
                        judge_text: ret,
                        judger: 1,
                        time_ms: time,
                        memory_kb: 0,
                    });
                })
                .catch((err) => {
                    const time = new Date().getTime() - start;
                    judge.end({
                        domainId,
                        rid,
                        status: STATUS.STATUS_SYSTEM_ERROR,
                        judge_text: `${err}\n${err.stack}`,
                        judger: 1,
                        time_ms: time,
                        memory_kb: 0,
                    });
                });
        }, 500);
        this.response.body = { rid };
        this.response.redirect = this.url('record_detail', { rid });
    }
}

class SystemSettingHandler extends SystemHandler {
    async get() {
        this.response.template = 'manage_settings.html';
        this.response.body.path.push(['manage_settings', null]);
        this.response.body.current = {};
        this.response.body.settings = setting.SYSTEM_SETTINGS;
        for (const s of this.response.body.settings) {
            // FIXME no-await-in-loop
            // eslint-disable-next-line no-await-in-loop
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
    Route('manage', '/manage', SystemMainHandler);
    Route('manage_dashboard', '/manage/dashboard', SystemDashboardHandler);
    Route('manage_script', '/manage/script', SystemScriptHandler);
    Route('manage_module', '/manage/module', SystemModuleHandler);
    Route('manage_setting', '/manage/setting', SystemSettingHandler);
}

global.Hydro.handler.manage = module.exports = apply;
