import { exec } from 'child_process';
import { inspect } from 'util';
import * as yaml from 'js-yaml';
import { omit, pick } from 'lodash';
import moment from 'moment';
import { Filter, ObjectId } from 'mongodb';
import Schema from 'schemastery';
import { Time } from '@hydrooj/utils';
import {
    CannotEditSuperAdminError, ContestNotFoundError, NotLaunchedByPM2Error, ProblemNotFoundError,
    RecordNotFoundError, UserNotFoundError, ValidationError,
} from '../error';
import { RecordDoc } from '../interface';
import { Logger } from '../logger';
import { NORMAL_STATUS, PRIV, STATUS } from '../model/builtin';
import * as contest from '../model/contest';
import domain from '../model/domain';
import problem from '../model/problem';
import record from '../model/record';
import * as setting from '../model/setting';
import * as system from '../model/system';
import user from '../model/user';
import {
    ConnectionHandler, Handler, param, requireSudo, Types,
} from '../service/server';
import * as judge from './judge';

const logger = new Logger('manage');

function set(key: string, value: any) {
    if (setting.SYSTEM_SETTINGS_BY_KEY[key]) {
        const s = setting.SYSTEM_SETTINGS_BY_KEY[key];
        if (s.flag & setting.FLAG_DISABLED) return undefined;
        if ((s.flag & setting.FLAG_SECRET) && !value) return undefined;
        if (s.type === 'boolean') {
            if (value === 'on') return true;
            return false;
        }
        if (s.type === 'number') {
            if (!Number.isSafeInteger(+value)) throw new ValidationError(key);
            return +value;
        }
        if (s.subType === 'yaml') {
            try {
                yaml.load(value);
            } catch (e) {
                throw new ValidationError(key);
            }
        }
        return value;
    }
    return undefined;
}

class SystemHandler extends Handler {
    async prepare() {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
    }
}

class SystemMainHandler extends SystemHandler {
    async get() {
        this.response.redirect = '/manage/dashboard';
    }
}

class SystemCheckConnHandler extends ConnectionHandler {
    id: string;

    async prepare() {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        await this.check();
    }

    async check() {
        const log = (payload: any) => this.send({ type: 'log', payload });
        const warn = (payload: any) => this.send({ type: 'warn', payload });
        const error = (payload: any) => this.send({ type: 'error', payload });
        await this.ctx.check.run(this, log, warn, error, (id) => { this.id = id; });
    }

    async cleanup() {
        this.ctx.check.cancel(this.id);
    }
}

class SystemDashboardHandler extends SystemHandler {
    async get() {
        this.response.template = 'manage_dashboard.html';
    }

    async postRestart() {
        if (!process.env.pm_cwd) throw new NotLaunchedByPM2Error();
        exec(`pm2 reload "${process.env.name}"`);
        this.back();
    }
}

class SystemScriptHandler extends SystemHandler {
    async get() {
        this.response.template = 'manage_script.html';
        this.response.body.scripts = global.Hydro.script;
    }

    @param('id', Types.Name)
    @param('args', Types.Content, true)
    async post(domainId: string, id: string, raw = '{}') {
        if (!global.Hydro.script[id]) throw new ValidationError('id');
        let args = JSON.parse(raw);
        if (typeof global.Hydro.script[id].validate === 'function') {
            args = global.Hydro.script[id].validate(args);
        }
        const rid = await record.add(domainId, -1, this.user._id, '-', id, false, { input: raw, type: 'pretest' });
        const report = (data) => judge.next({ domainId, rid, ...data });
        report({ message: `Running script: ${id} `, status: STATUS.STATUS_JUDGING });
        const start = Date.now();
        // Maybe async?
        global.Hydro.script[id].run(args, report)
            .then((ret: any) => {
                const time = new Date().getTime() - start;
                judge.end({
                    domainId,
                    rid: rid.toHexString(),
                    status: STATUS.STATUS_ACCEPTED,
                    message: inspect(ret, false, 10, true),
                    judger: 1,
                    time,
                    memory: 0,
                });
            })
            .catch((err: Error) => {
                const time = new Date().getTime() - start;
                logger.error(err);
                judge.end({
                    domainId,
                    rid: rid.toHexString(),
                    status: STATUS.STATUS_SYSTEM_ERROR,
                    message: `${err.message} \n${(err as any).params || []} \n${err.stack} `,
                    judger: 1,
                    time,
                    memory: 0,
                });
            });
        this.response.body = { rid };
        this.response.redirect = this.url('record_detail', { rid });
    }
}

class SystemSettingHandler extends SystemHandler {
    @requireSudo
    async get() {
        this.response.template = 'manage_setting.html';
        this.response.body.current = {};
        this.response.body.settings = setting.SYSTEM_SETTINGS;
        for (const s of this.response.body.settings) {
            this.response.body.current[s.key] = system.get(s.key);
        }
    }

    @requireSudo
    async post(args: any) {
        const tasks = [];
        const booleanKeys = args.booleanKeys || {};
        delete args.booleanKeys;
        for (const key in args) {
            if (typeof args[key] === 'object') {
                for (const subkey in args[key]) {
                    const val = set(`${key}.${subkey}`, args[key][subkey]);
                    if (val !== undefined) {
                        tasks.push(system.set(`${key}.${subkey}`, val));
                    }
                }
            }
        }
        for (const key in booleanKeys) {
            if (typeof booleanKeys[key] === 'object') {
                for (const subkey in booleanKeys[key]) {
                    if (!args[key]?.[subkey]) tasks.push(system.set(`${key}.${subkey}`, false));
                }
            }
        }
        await Promise.all(tasks);
        this.ctx.broadcast('system/setting', args);
        this.back();
    }
}

class SystemConfigHandler extends SystemHandler {
    @requireSudo
    async get() {
        this.response.template = 'manage_config.html';
        let value;

        const processNode = (node: any, schema: Schema<any, any>, parent?: any, accessKey?: string) => {
            if (['union', 'intersect'].includes(schema.type)) {
                for (const item of schema.list) processNode(node, item, parent, accessKey);
            }
            if (parent && (schema.meta.secret === true || schema.meta.role === 'secret')) {
                if (schema.type === 'string') parent[accessKey] = '[hidden]';
                // TODO support more types
            }
            if (schema.type === 'object') {
                for (const key in schema.dict) processNode(node[key], schema.dict[key], node, key);
            }
        };

        try {
            try {
                value = Schema.intersect(this.ctx.config.settings)(yaml.load(this.ctx.config.configSource));
            } catch (e) {
                value = yaml.load(this.ctx.config.configSource);
            }
            for (const schema of this.ctx.config.settings) processNode(value, schema);
        } catch (e) { }
        this.response.body = {
            schema: Schema.intersect(this.ctx.config.settings).toJSON(),
            value: yaml.dump(value),
        };
    }

    @requireSudo
    @param('value', Types.String)
    async post({ }, value: string) {
        const oldConfig = yaml.load(this.ctx.config.configSource);
        let config;
        const processNode = (node: any, old: any, schema: Schema<any, any>, parent?: any, accessKey?: string) => {
            if (['union', 'intersect'].includes(schema.type)) {
                for (const item of schema.list) processNode(node, old, item, parent, accessKey);
            }
            if (parent && (schema.meta.secret === true || schema.meta.role === 'secret')) {
                if (node === '[hidden]') parent[accessKey] = old;
                // TODO support more types
            }
            if (schema.type === 'object') {
                for (const key in schema.dict) processNode(node[key] || {}, old[key] || {}, schema.dict[key], node, key);
            }
        };

        try {
            config = yaml.load(value);
            for (const schema of this.ctx.config.settings) processNode(config, oldConfig, schema, null, '');
        } catch (e) {
            throw new ValidationError('value', '', e.message);
        }
        await this.ctx.config.saveConfig(config);
    }
}

/* eslint-disable no-await-in-loop */
class SystemUserImportHandler extends SystemHandler {
    async get() {
        this.response.body.users = [];
        this.response.template = 'manage_user_import.html';
    }

    @param('users', Types.Content)
    @param('draft', Types.Boolean)
    async post(domainId: string, _users: string, draft: boolean) {
        const users = _users.split('\n');
        const udocs: { email: string, username: string, password: string, displayName?: string, [key: string]: any; }[] = [];
        const messages = [];
        const mapping = Object.create(null);
        const groups: Record<string, string[]> = Object.create(null);
        for (const i in users) {
            const u = users[i];
            if (!u.trim()) continue;
            let [email, username, password, displayName, extra] = u.split('\t').map((t) => t.trim());
            if (!email || !username || !password) {
                const data = u.split(',').map((t) => t.trim());
                [email, username, password, displayName, extra] = data;
                if (data.length > 5) extra = data.slice(4).join(',');
            }
            if (email && username && password) {
                if (!Types.Email[1](email)) messages.push(`Line ${+i + 1}: Invalid email.`);
                else if (!Types.Username[1](username)) messages.push(`Line ${+i + 1}: Invalid username`);
                else if (!Types.Password[1](password)) messages.push(`Line ${+i + 1}: Invalid password`);
                else if (udocs.find((t) => t.email === email) || await user.getByEmail('system', email)) {
                    messages.push(`Line ${+i + 1}: Email ${email} already exists.`);
                } else if (udocs.find((t) => t.username === username) || await user.getByUname('system', username)) {
                    messages.push(`Line ${+i + 1}: Username ${username} already exists.`);
                } else {
                    const payload: any = {};
                    try {
                        const data = JSON.parse(extra);
                        if (data.group) {
                            groups[data.group] ||= [];
                            groups[data.group].push(email);
                        }
                        Object.assign(payload, data);
                    } catch (e) { }
                    Object.assign(payload, {
                        email, username, password, displayName,
                    });
                    await this.ctx.serial('user/import/parse', payload);
                    udocs.push(payload);
                }
            } else messages.push(`Line ${+i + 1}: Input invalid.`);
        }
        messages.push(`${udocs.length} users found.`);
        if (!draft) {
            for (const udoc of udocs) {
                try {
                    const uid = await user.create(udoc.email, udoc.username, udoc.password);
                    mapping[udoc.email] = uid;
                    if (udoc.displayName) await domain.setUserInDomain(domainId, uid, { displayName: udoc.displayName });
                    if (udoc.school) await user.setById(uid, { school: udoc.school });
                    if (udoc.studentId) await user.setById(uid, { studentId: udoc.studentId });
                    await this.ctx.serial('user/import/create', uid, udoc);
                } catch (e) {
                    messages.push(e.message);
                }
            }
            const existing = await user.listGroup(domainId);
            for (const name in groups) {
                const uids = groups[name].map((i) => mapping[i]).filter((i) => i);
                const current = existing.find((i) => i.name === name)?.uids || [];
                if (uids.length) await user.updateGroup(domainId, name, Array.from(new Set([...current, ...uids])));
            }
        }
        this.response.body.users = udocs;
        this.response.body.messages = messages;
    }
}
/* eslint-enable no-await-in-loop */

const Priv = omit(PRIV, ['PRIV_DEFAULT', 'PRIV_NEVER', 'PRIV_NONE', 'PRIV_ALL']);
const allPriv = Math.sum(Object.values(Priv));

class SystemUserPrivHandler extends SystemHandler {
    @requireSudo
    @param('extraIgnore', Types.NumericArray, true)
    async get({ }, extraIgnore: number[] = []) {
        const defaultPriv = system.get('default.priv');
        const udocs = await user.getMulti({
            _id: { $gte: -1000, $ne: 1 }, priv: { $nin: [0, defaultPriv, ...extraIgnore] },
        }).limit(1000).sort({ _id: 1 }).toArray();
        const banudocs = await user.getMulti({ _id: { $gte: -1000, $ne: 1 }, priv: 0 }).limit(1000).sort({ _id: 1 }).toArray();
        this.response.body = {
            udocs: [...udocs, ...banudocs],
            defaultPriv,
            Priv,
        };
        this.response.pjax = 'partials/manage_user_priv.html';
        this.response.template = 'manage_user_priv.html';
    }

    @requireSudo
    @param('uid', Types.Int)
    @param('priv', Types.UnsignedInt)
    @param('system', Types.Boolean)
    async post(domainId: string, uid: number, priv: number, editSystem: boolean) {
        if (!editSystem) {
            const udoc = await user.getById(domainId, uid);
            if (!udoc) throw new UserNotFoundError(uid);
            if (udoc.priv === -1 || priv === -1 || priv === allPriv) throw new CannotEditSuperAdminError();
            await user.setPriv(uid, priv);
        } else {
            const defaultPriv = system.get('default.priv');
            await user.coll.updateMany({ priv: defaultPriv }, { $set: { priv } });
            await system.set('default.priv', priv);
            this.ctx.broadcast('user/delcache', true);
        }
        this.back();
    }
}

class SystemRejudgeHandler extends SystemHandler {
    async get() {
        this.response.body = {
            rrdocs: await record.getMultiRejudgeTask(undefined, {}),
            apply: true,
            status: NORMAL_STATUS.filter((i: STATUS) => ![STATUS.STATUS_COMPILE_ERROR, STATUS.STATUS_ACCEPTED].includes(i)).join(','),
        };
        this.response.template = 'manage_rejudge.html';
    }

    @param('uidOrName', Types.UidOrName, true)
    @param('pid', Types.ProblemId, true)
    @param('tid', Types.ObjectId, true)
    @param('langs', Types.CommaSeperatedArray, true)
    @param('beginAtDate', Types.Date, true)
    @param('beginAtTime', Types.Time, true)
    @param('endAtDate', Types.Date, true)
    @param('endAtTime', Types.Time, true)
    @param('status', Types.CommaSeperatedArray, true)
    @param('type', Types.Range(['preview', 'rejudge']))
    @param('high_priority', Types.Boolean)
    @param('apply', Types.Boolean)
    async post(
        domainId: string, uidOrName?: string, pid?: string | number, tid?: ObjectId,
        langs: string[] = [], beginAtDate?: string, beginAtTime?: string, endAtDate?: string,
        endAtTime?: string, status: string[] = [], _type = 'rejudge', highPriority = false, _apply = false,
    ) {
        const q: Filter<RecordDoc> = {};
        if (uidOrName) {
            const udoc = await user.getById(domainId, +uidOrName)
                || await user.getByUname(domainId, uidOrName)
                || await user.getByEmail(domainId, uidOrName);
            if (udoc) q.uid = udoc._id;
            else throw new UserNotFoundError(uidOrName);
        }
        if (tid) {
            const tdoc = await contest.get(domainId, tid);
            if (!tdoc) throw new ContestNotFoundError(domainId, tid);
            q.contest = tdoc._id;
        }
        if (pid) {
            const pdoc = await problem.get(domainId, pid);
            if (pdoc) q.pid = pdoc.docId;
            else throw new ProblemNotFoundError(domainId, pid);
        }
        if (langs.length) q.lang = { $in: langs.filter((i) => setting.langs[i]) };
        let beginAt = null;
        let endAt = null;
        if (beginAtDate) {
            beginAt = moment(`${beginAtDate} ${beginAtTime || '00:00'}`);
            if (!beginAt.isValid()) throw new ValidationError('beginAtDate', 'beginAtTime');
            q._id ||= {};
            q._id = { ...q._id, $gte: Time.getObjectID(beginAt) };
        }
        if (endAtDate) {
            endAt = moment(`${endAtDate} ${endAtTime || '23:59'}`);
            if (!endAt.isValid()) throw new ValidationError('endAtDate', 'endAtTime');
            q._id ||= {};
            q._id = { ...q._id, $lte: Time.getObjectID(endAt) };
        }
        if (beginAt && endAt && beginAt.isSameOrAfter(endAt)) throw new ValidationError('duration');
        const rdocs = await record.getMulti(domainId, q).project({ _id: 1, contest: 1 }).toArray();
        if (_type === 'preview') {
            this.response.body = {
                uidOrName,
                pid,
                tid,
                langs: langs.join(','),
                beginAtDate,
                beginAtTime,
                endAtDate,
                endAtTime,
                status: status.join(','),
                highPriority,
                apply: _apply,
                recordLength: rdocs.length,
                rrdocs: await record.getMultiRejudgeTask(undefined, {}),
            };
            this.response.template = 'manage_rejudge.html';
            return;
        }
        const rid = await record.addRejudgeTask(domainId, {
            owner: this.user._id,
            apply: _apply,
        });
        const priority = await record.submissionPriority(this.user._id, (highPriority ? 0 : -10000) - rdocs.length * 5 - 50);
        if (_apply) await record.reset(domainId, rdocs.map((rdoc) => rdoc._id), true);
        else {
            await record.collHistory.insertMany(rdocs.map((rdoc) => ({
                ...pick(rdoc, [
                    'compilerTexts', 'judgeTexts', 'testCases', 'subtasks',
                    'score', 'time', 'memory', 'status', 'judgeAt', 'judger',
                ]),
                rid: rdoc._id,
                _id: new ObjectId(),
            })));
        }
        await Promise.all([
            record.judge(domainId, rdocs.filter((i) => i.contest).map((i) => i._id), priority, { detail: false },
                { rejudge: _apply ? true : 'controlled' }),
            record.judge(domainId, rdocs.filter((i) => !i.contest).map((i) => i._id), priority, {},
                { rejudge: _apply ? true : 'controlled' }),
        ]);
        this.response.redirect = this.url('manage_rejudge_detail', { rid });
    }
}

class SystemRejudgeDetailHandler extends SystemHandler {
    @param('rid', Types.ObjectId)
    async get(domainId: string, rid: ObjectId) {
        const rrdoc = await record.getRejudgeTask(domainId, rid);
        const rdocs = await record.getMulti(domainId, { _id: { $in: rrdoc.rids } }).toArray();
        if (!rrdoc) throw new RecordNotFoundError(domainId, rid);
        this.response.body = { rrdoc, rdocs };
        this.response.template = 'manage_rejudge_detail.html';
    }
}

export const inject = ['config', 'check'];
export async function apply(ctx) {
    ctx.Route('manage', '/manage', SystemMainHandler);
    ctx.Route('manage_dashboard', '/manage/dashboard', SystemDashboardHandler);
    ctx.Route('manage_script', '/manage/script', SystemScriptHandler);
    ctx.Route('manage_setting', '/manage/setting', SystemSettingHandler);
    ctx.Route('manage_config', '/manage/config', SystemConfigHandler);
    ctx.Route('manage_user_import', '/manage/userimport', SystemUserImportHandler);
    ctx.Route('manage_user_priv', '/manage/userpriv', SystemUserPrivHandler);
    ctx.Route('manage_rejudge', '/manage/rejudge', SystemRejudgeHandler);
    ctx.Route('manage_rejudge_detail', '/manage/rejudge/:rid', SystemRejudgeDetailHandler);
    ctx.Connection('manage_check', '/manage/check-conn', SystemCheckConnHandler);
}
