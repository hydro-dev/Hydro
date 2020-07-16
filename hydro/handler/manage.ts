import * as judge from './judge';
import { ValidationError } from '../error';
import * as check from '../check';
import * as setting from '../model/setting';
import * as system from '../model/system';
import { STATUS, PRIV } from '../model/builtin';
import * as record from '../model/record';
import {
    Route, Connection, Handler, ConnectionHandler, param, Types,
} from '../service/server';
import { validate } from '../lib/validator';
import * as hpm from '../lib/hpm';

function set(key, value) {
    if (setting.SYSTEM_SETTINGS_BY_KEY[key]) {
        const s = setting.SYSTEM_SETTINGS_BY_KEY[key];
        if (s.flag & setting.FLAG_DISABLED) return undefined;
        if (s.flag & setting.FLAG_SECRET && !value) return undefined;
        if (s.type === 'boolean') {
            if (value === 'on') return true;
            return false;
        }
        if (s.type === 'number') {
            if (!Number.isSafeInteger(parseInt(value, 10))) {
                throw new ValidationError(key);
            }
            return parseInt(value, 10);
        }
        return value;
    }
    return undefined;
}

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

class SystemCheckConnHandler extends ConnectionHandler {
    id: any;

    async prepare() {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        await this.check();
    }

    async check() {
        const log = (payload) => this.send({ type: 'log', payload });
        const warn = (payload) => this.send({ type: 'warn', payload });
        const error = (payload) => this.send({ type: 'error', payload });
        await check.start(log, warn, error, (id) => { this.id = id; });
    }

    async cleanup() {
        check.cancel(this.id);
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
        this.response.template = 'manage_module.html';
    }

    async postInstall({ url }) {
        await hpm.install(url);
        this.back();
    }
}

class SystemScriptHandler extends SystemHandler {
    async get() {
        this.response.template = 'manage_script.html';
        this.response.body.scripts = global.Hydro.script;
        this.response.body.path.push(['manage_script', null]);
    }

    @param('id', Types.String)
    @param('args', Types.String, true)
    async post(domainId: string, id: string, args = '{}') {
        if (!global.Hydro.script[id]) throw new ValidationError('id');
        args = JSON.parse(args);
        validate(global.Hydro.script[id].validate, args);
        const rid = await record.add(domainId, {
            pid: 1,
            uid: this.user._id,
            lang: null,
            code: null,
            status: STATUS.STATUS_JUDGING,
            hidden: true,
        }, false);
        judge.next({ domainId, rid, message: `Running script: ${id}` });
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
                        judge_text: ret.toString(),
                        judger: 1,
                        time_ms: time,
                        memory_kb: 0,
                    });
                })
                .catch((err: Error) => {
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
        this.response.template = 'manage_setting.html';
        this.response.body.path.push(['manage_setting', null]);
        this.response.body.current = {};
        this.response.body.settings = setting.SYSTEM_SETTINGS;
        for (const s of this.response.body.settings) {
            // FIXME no-await-in-loop
            // eslint-disable-next-line no-await-in-loop
            this.response.body.current[s.key] = await system.get(s.key);
        }
    }

    async post(args: any) {
        const tasks = [];
        for (const key in args) {
            if (typeof args[key] === 'object') {
                for (const subkey in args[key]) {
                    if (typeof set(`${key}.${subkey}`, args[key][subkey]) !== 'undefined') {
                        tasks.push(system.set(`${key}.${subkey}`, set(`${key}.${subkey}`, args[key][subkey])));
                    }
                }
            } else if (typeof set(key, args[key]) !== 'undefined') {
                tasks.push(system.set(key, set(key, args[key])));
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
    Connection('manage_check', '/manage/check-conn', SystemCheckConnHandler);
}

global.Hydro.handler.manage = module.exports = apply;
