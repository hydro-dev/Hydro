import { Dictionary } from 'lodash';
import moment from 'moment-timezone';
import {
    DomainJoinAlreadyMemberError, DomainJoinForbiddenError,
    InvalidJoinInvitationCodeError,
    RoleAlreadyExistError, ValidationError } from '../error';
import type { DomainDoc } from '../interface';
import avatar from '../lib/avatar';
import paginate from '../lib/paginate';
import {
    DEFAULT_NODES, PERM, PERMS_BY_FAMILY, PRIV,
} from '../model/builtin';
import * as discussion from '../model/discussion';
import domain from '../model/domain';
import { DOMAIN_SETTINGS, DOMAIN_SETTINGS_BY_KEY } from '../model/setting';
import * as system from '../model/system';
import user from '../model/user';
import {
    Handler, param, post,
    query,     Route, Types } from '../service/server';
import { log2 } from '../utils';

class DomainRankHandler extends Handler {
    @query('page', Types.PositiveInt, true)
    async get(domainId: string, page = 1) {
        const [dudocs, upcount, ucount] = await paginate(
            domain.getMultiUserInDomain(domainId, { uid: { $nin: [0, 1] } }).sort({ rp: -1 }),
            page,
            100,
        );
        let udocs = [];
        for (const dudoc of dudocs) {
            udocs.push(user.getById(domainId, dudoc.uid));
        }
        udocs = await Promise.all(udocs);
        const path = [
            ['Hydro', 'homepage'],
            ['ranking', null],
        ];
        this.response.template = 'ranking.html';
        this.response.body = {
            udocs, upcount, ucount, page, path,
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
        const path = [
            ['Hydro', 'homepage'],
            ['domain', null],
            ['domain_edit', null],
        ];
        this.response.template = 'domain_edit.html';
        this.response.body = { current: this.domain, settings: DOMAIN_SETTINGS, path };
    }

    async post(args) {
        const $set = {};
        for (const key in args) {
            if (DOMAIN_SETTINGS_BY_KEY[key]) $set[key] = args[key];
        }
        await domain.edit(args.domainId, $set);
        this.response.redirect = this.url('domain_dashboard');
    }
}

class DomainDashboardHandler extends ManageHandler {
    async get() {
        const path = [
            ['Hydro', 'homepage'],
            ['domain', null],
            ['domain_dashboard', null],
        ];
        this.response.template = 'domain_dashboard.html';
        this.response.body = { domain: this.domain, path };
    }

    async postInitDiscussionNode({ domainId }) {
        for (const category of Object.keys(DEFAULT_NODES)) {
            for (const item of DEFAULT_NODES[category]) {
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
        const path = [
            ['Hydro', 'homepage'],
            ['domain', null],
            ['domain_user', null],
        ];
        this.response.template = 'domain_user.html';
        this.response.body = {
            roles, rolesSelect, rudocs, udict, path, domain: this.domain,
        };
    }

    @post('uid', Types.Int)
    @post('role', Types.Name)
    async postSetUser(domainId: string, uid: number, role: string) {
        await domain.setUserRole(domainId, uid, role);
        this.back();
    }

    @param('uid', Types.NumericArray)
    @param('role', Types.Name)
    async postSetUsers(domainId: string, uid: number[], role: string) {
        await domain.setUserRole(domainId, uid, role);
        this.back();
    }
}

class DomainPermissionHandler extends ManageHandler {
    async get({ domainId }) {
        const roles = await domain.getRoles(domainId);
        const path = [
            ['Hydro', 'homepage'],
            ['domain', null],
            ['domain_permission', null],
        ];
        this.response.template = 'domain_permission.html';
        this.response.body = {
            roles, PERMS_BY_FAMILY, domain: this.domain, path, log2,
        };
    }

    async post({ domainId }) {
        const roles = {};
        delete this.request.body.csrfToken;
        for (const role in this.request.body) {
            const perms = this.request.body[role] instanceof Array
                ? this.request.body[role]
                : [this.request.body[role]];
            // @ts-expect-error
            roles[role] = 0n;
            // @ts-expect-error
            for (const r of perms) roles[role] |= 1n << BigInt(r);
        }
        await domain.setRoles(domainId, roles);
        this.back();
    }
}

class DomainRoleHandler extends ManageHandler {
    async get({ domainId }) {
        const roles = await domain.getRoles(domainId, true);
        const path = [
            ['Hydro', 'homepage'],
            ['domain', null],
            ['domain_role', null],
        ];
        this.response.template = 'domain_role.html';
        this.response.body = { roles, domain: this.domain, path };
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
        for (const role of roles) {
            if (['root', 'default', 'guest'].includes(role)) {
                throw new ValidationError('role');
            }
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
        this.response.body.path = [
            ['Hydro', 'homepage'],
            ['domain', null],
            ['domain_join_applications', null],
        ];
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

class DomainJoinHandler extends Handler {
    joinSettings: any;

    constructor(ctx) {
        super(ctx);
        this.noCheckPermView = true;
    }

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
        this.response.body.path = [
            ['Hydro', 'homepage'],
            ['domain_join', 'domain_join', { domainId, code }],
        ];
    }

    @param('code', Types.Content, true)
    async post(domainId: string, code: string) {
        if (this.joinSettings.method === domain.JOIN_METHOD_CODE) {
            if (this.joinSettings.code !== code) {
                throw new InvalidJoinInvitationCodeError(this.domain._id);
            }
        }
        await domain.setUserRole(this.domain._id, this.user._id, this.joinSettings.role);
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
    Route('domain_join_applications', '/domain/join_applications', DomainJoinApplicationsHandler);
    Route('domain_join', '/domain/join', DomainJoinHandler, PRIV.PRIV_USER_PROFILE);
    Route('domain_search', '/domain/search', DomainSearchHandler, PRIV.PRIV_USER_PROFILE);
}

global.Hydro.handler.domain = apply;
