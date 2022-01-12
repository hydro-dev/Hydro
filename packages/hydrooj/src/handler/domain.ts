import { load } from 'js-yaml';
import { Dictionary } from 'lodash';
import moment from 'moment-timezone';
import {
    DomainJoinAlreadyMemberError, DomainJoinForbiddenError, ForbiddenError,
    InvalidJoinInvitationCodeError, PermissionError, RoleAlreadyExistError, ValidationError,
} from '../error';
import type { DomainDoc } from '../interface';
import avatar from '../lib/avatar';
import paginate from '../lib/paginate';
import { PERM, PERMS_BY_FAMILY, PRIV } from '../model/builtin';
import * as discussion from '../model/discussion';
import domain from '../model/domain';
import * as oplog from '../model/oplog';
import { DOMAIN_SETTINGS, DOMAIN_SETTINGS_BY_KEY } from '../model/setting';
import * as system from '../model/system';
import user from '../model/user';
import {
    Handler, param, post, query, Route, Types,
} from '../service/server';
import { log2 } from '../utils';
import { registerResolver, registerValue } from './api';

registerValue('GroupInfo', [
    ['name', 'String!'],
    ['uids', '[Int]!'],
]);

registerResolver('Query', 'domain(id: String)', 'Domain', async (args, ctx) => {
    const ddoc = await domain.get(args.id);
    if (!ddoc) return null;
    const udoc = await user.getById(args.id, ctx.user._id);
    if (!udoc.hasPerm(PERM.PERM_VIEW) && !udoc.hasPriv(PRIV.PRIV_VIEW_ALL_DOMAIN)) return null;
    ctx.udoc = udoc;
    return ddoc;
});

registerResolver('Domain', 'manage', 'DomainManage', async (args, ctx) => {
    if (!ctx.udoc.hasPerm(PERM.PERM_EDIT_DOMAIN)) throw new PermissionError(PERM.PERM_EDIT_DOMAIN);
    return {};
});

registerResolver('DomainManage', 'group', 'DomainGroup', (args, ctx) => ctx.parent);
registerResolver(
    'DomainGroup', 'list(uid: Int)', '[GroupInfo]',
    (args, ctx) => user.listGroup(ctx.parent._id, args.uid),
);
registerResolver(
    'DomainGroup', 'update(name: String!, uids: [Int]!)', 'Boolean',
    async (args, ctx) => !!(await user.updateGroup(ctx.parent._id, args.name, args.uids)).upsertedCount,
);
registerResolver(
    'DomainGroup', 'del(name: String!)', 'Boolean',
    async (args, ctx) => !!(await user.delGroup(ctx.parent._id, args.name)).deletedCount,
);

class DomainRankHandler extends Handler {
    @query('page', Types.PositiveInt, true)
    async get(domainId: string, page = 1) {
        const [dudocs, upcount, ucount] = await paginate(
            domain.getMultiUserInDomain(domainId, { uid: { $gt: 1 } }).sort({ rp: -1 }),
            page,
            100,
        );
        let udocs = [];
        for (const dudoc of dudocs) {
            udocs.push(user.getById(domainId, dudoc.uid));
        }
        udocs = await Promise.all(udocs);
        this.response.template = 'ranking.html';
        this.response.body = {
            udocs, upcount, ucount, page,
        };
    }
}

class ManageHandler extends Handler {
    domain: DomainDoc;

    async prepare({ domainId }) {
        this.checkPerm(PERM.PERM_EDIT_DOMAIN);
        this.domain = await domain.get(domainId);
    }
}

class DomainEditHandler extends ManageHandler {
    async get() {
        this.response.template = 'domain_edit.html';
        this.response.body = { current: this.domain, settings: DOMAIN_SETTINGS };
    }

    async post(args) {
        if (args.operation) return;
        const $set = {};
        for (const key in args) {
            if (DOMAIN_SETTINGS_BY_KEY[key]) $set[key] = args[key];
        }
        await domain.edit(args.domainId, $set);
        this.response.redirect = this.url('domain_dashboard');
    }

    async postDelete({ domainId, password }) {
        this.user.checkPassword(password);
        if (domainId === 'system') throw new ForbiddenError('You are not allowed to delete system domain');
        if (this.domain.owner !== this.user._id) throw new ForbiddenError('You are not the owner of this domain.');
        await domain.del(domainId);
        this.response.redirect = this.url('home_domain', { domainId: 'system' });
    }
}

class DomainDashboardHandler extends ManageHandler {
    async get() {
        this.response.template = 'domain_dashboard.html';
        this.response.body = { domain: this.domain };
    }

    async postInitDiscussionNode({ domainId }) {
        const nodes = load(system.get('discussion.nodes'));
        await discussion.flushNodes(domainId);
        for (const category of Object.keys(nodes)) {
            for (const item of nodes[category]) {
                // eslint-disable-next-line no-await-in-loop
                const curr = await discussion.getNode(domainId, item.name);
                // eslint-disable-next-line no-await-in-loop
                if (!curr) await discussion.addNode(domainId, item.name, category, item.pic ? { pic: item.pic } : undefined);
            }
        }
        this.back();
    }
}

class DomainUserHandler extends ManageHandler {
    async get({ domainId }) {
        const rudocs = {};
        const [dudocs, roles] = await Promise.all([
            domain.getMultiUserInDomain(domainId, {
                $and: [
                    { role: { $nin: ['default', 'guest'] } },
                    { role: { $ne: null } },
                ],
            }).toArray(),
            domain.getRoles(domainId),
        ]);
        const uids = dudocs.map((dudoc) => dudoc.uid);
        const udict = await user.getList(domainId, uids);
        for (const role of roles) rudocs[role._id] = [];
        for (const dudoc of dudocs) {
            const ud = udict[dudoc.uid];
            rudocs[ud.role || 'default'].push(ud);
        }
        const rolesSelect = roles.map((role) => [role._id, role._id]);
        this.response.template = 'domain_user.html';
        this.response.body = {
            roles, rolesSelect, rudocs, udict, domain: this.domain,
        };
    }

    @post('uid', Types.Int)
    @post('role', Types.Name)
    async postSetUser(domainId: string, uid: number, role: string) {
        await Promise.all([
            domain.setUserRole(domainId, uid, role),
            oplog.log(this, 'domain.setRole', { uid, role }),
        ]);
        this.back();
    }

    @param('uid', Types.NumericArray)
    @param('role', Types.Name)
    async postSetUsers(domainId: string, uid: number[], role: string) {
        await Promise.all([
            domain.setUserRole(domainId, uid, role),
            oplog.log(this, 'domain.setRole', { uid, role }),
        ]);
        this.back();
    }
}

class DomainPermissionHandler extends ManageHandler {
    async get({ domainId }) {
        const roles = await domain.getRoles(domainId);
        this.response.template = 'domain_permission.html';
        this.response.body = {
            roles, PERMS_BY_FAMILY, domain: this.domain, log2,
        };
    }

    async post({ domainId }) {
        const roles = {};
        delete this.request.body.csrfToken;
        for (const role in this.request.body) {
            const perms = this.request.body[role] instanceof Array
                ? this.request.body[role]
                : [this.request.body[role]];
            roles[role] = 0n;
            for (const r of perms) roles[role] |= 1n << BigInt(r);
        }
        await domain.setRoles(domainId, roles);
        this.back();
    }
}

class DomainRoleHandler extends ManageHandler {
    async get({ domainId }) {
        const roles = await domain.getRoles(domainId, true);
        this.response.template = 'domain_role.html';
        this.response.body = { roles, domain: this.domain };
    }

    @param('role', Types.Name)
    async postAdd(domainId: string, role: string) {
        const roles = await domain.getRoles(this.domain);
        const rdict: Dictionary<any> = {};
        for (const r of roles) rdict[r._id] = r.perm;
        if (rdict[role]) throw new RoleAlreadyExistError(role);
        await domain.addRole(domainId, role, rdict.default);
        this.back();
    }

    @param('roles', Types.Array)
    async postDelete(domainId: string, roles: string[]) {
        if (Set.intersection(roles, ['root', 'default', 'guest']).size > 0) {
            throw new ValidationError('role', null, 'You cannot delete root, default or guest roles');
        }
        await domain.deleteRoles(domainId, roles);
        this.back();
    }
}

class DomainJoinApplicationsHandler extends ManageHandler {
    async get() {
        const r = await domain.getRoles(this.domain);
        const roles = r.map((role) => role._id).sort();
        this.response.body.rolesWithText = roles.map((role) => [role, role]);
        this.response.body.joinSettings = domain.getJoinSettings(this.domain, roles);
        this.response.body.expirations = { ...domain.JOIN_EXPIRATION_RANGE };
        if (!this.response.body.joinSettings) {
            delete this.response.body.expirations[domain.JOIN_EXPIRATION_KEEP_CURRENT];
        }
        this.response.body.url_prefix = (this.domain.host || [])[0] || system.get('server.url');
        this.response.template = 'domain_join_applications.html';
    }

    @post('method', Types.Range([domain.JOIN_METHOD_NONE, domain.JOIN_METHOD_ALL, domain.JOIN_METHOD_CODE]))
    @post('role', Types.Name, true)
    @post('expire', Types.Int, true)
    @post('invitationCode', Types.Content, true)
    async post(domainId: string, method: number, role: string, expire: number, invitationCode = '') {
        const r = await domain.getRoles(this.domain);
        const roles = r.map((rl) => rl._id);
        const current = domain.getJoinSettings(this.domain, roles);
        let joinSettings;
        if (method === domain.JOIN_METHOD_NONE) joinSettings = null;
        else {
            if (!roles.includes(role)) throw new ValidationError('role');
            if (!current && expire === domain.JOIN_EXPIRATION_KEEP_CURRENT) throw new ValidationError('expire');
            joinSettings = { method, role };
            if (expire === domain.JOIN_EXPIRATION_KEEP_CURRENT) joinSettings.expire = current.expire;
            else if (expire === domain.JOIN_EXPIRATION_UNLIMITED) joinSettings.expire = null;
            else if (!domain.JOIN_EXPIRATION_RANGE[expire]) throw new ValidationError('expire');
            else joinSettings.expire = moment().add(expire, 'hours').toDate();
            if (method === domain.JOIN_METHOD_CODE) joinSettings.code = invitationCode;
        }
        await domain.edit(domainId, { _join: joinSettings });
        this.back();
    }
}

class DomainUserGroupHandler extends ManageHandler {
    async get() {
        this.response.body = 'domain_group.html';
    }

    @param('name', Types.Name)
    async postDel(domainId: string, name: string) {
        await user.delGroup(domainId, name);
        this.back();
    }

    @param('name', Types.Name)
    @param('uids', Types.NumericArray)
    async postUpdate(domainId: string, name: string, uids: number[]) {
        await user.updateGroup(domainId, name, uids);
        this.back();
    }
}

class DomainJoinHandler extends Handler {
    joinSettings: any;
    noCheckPermView = true;

    async prepare() {
        const r = await domain.getRoles(this.domain);
        const roles = r.map((role) => role._id);
        this.joinSettings = domain.getJoinSettings(this.domain, roles);
        if (!this.joinSettings) throw new DomainJoinForbiddenError(this.domain._id);
        if (this.user.role !== 'default') throw new DomainJoinAlreadyMemberError(this.domain._id, this.user._id);
    }

    @param('code', Types.Content, true)
    async get(domainId: string, code: string) {
        this.response.template = 'domain_join.html';
        this.response.body.joinSettings = this.joinSettings;
        this.response.body.code = code;
    }

    @param('code', Types.Content, true)
    async post(domainId: string, code: string) {
        if (this.joinSettings.method === domain.JOIN_METHOD_CODE) {
            if (this.joinSettings.code !== code) {
                throw new InvalidJoinInvitationCodeError(this.domain._id);
            }
        }
        await Promise.all([
            domain.setUserRole(this.domain._id, this.user._id, this.joinSettings.role),
            oplog.log(this, 'domain.join', {}),
        ]);
        this.response.redirect = this.url('homepage', { query: { notification: 'Successfully joined domain.' } });
    }
}

class DomainSearchHandler extends Handler {
    @param('q', Types.Content)
    async get(domainId: string, q: string) {
        const ddocs = await domain.getPrefixSearch(q, 20);
        for (let i = 0; i < ddocs.length; i++) {
            ddocs[i].avatarUrl = ddocs[i].avatar ? avatar(ddocs[i].avatar, 64) : '/img/team_avatar.png';
        }
        this.response.body = ddocs;
    }
}

export async function apply() {
    Route('ranking', '/ranking', DomainRankHandler, PERM.PERM_VIEW_RANKING);
    Route('domain_dashboard', '/domain/dashboard', DomainDashboardHandler);
    Route('domain_edit', '/domain/edit', DomainEditHandler);
    Route('domain_user', '/domain/user', DomainUserHandler);
    Route('domain_permission', '/domain/permission', DomainPermissionHandler);
    Route('domain_role', '/domain/role', DomainRoleHandler);
    Route('domain_group', '/domain/group', DomainUserGroupHandler);
    Route('domain_join_applications', '/domain/join_applications', DomainJoinApplicationsHandler);
    Route('domain_join', '/domain/join', DomainJoinHandler, PRIV.PRIV_USER_PROFILE);
    Route('domain_search', '/domain/search', DomainSearchHandler, PRIV.PRIV_USER_PROFILE);
}

global.Hydro.handler.domain = apply;
