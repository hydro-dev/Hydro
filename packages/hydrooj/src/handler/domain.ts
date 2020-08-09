import moment from 'moment-timezone';
import {
    RoleAlreadyExistError, ValidationError, DomainJoinForbiddenError,
    DomainJoinAlreadyMemberError, InvalidJoinInvitationCodeError,
} from '../error';
import * as user from '../model/user';
import * as domain from '../model/domain';
import { DOMAIN_SETTINGS, DOMAIN_SETTINGS_BY_KEY } from '../model/setting';
import { PERM, PERMS_BY_FAMILY, PRIV } from '../model/builtin';
import { gravatar } from '../lib/misc';
import paginate from '../lib/paginate';
import {
    Route, Handler, Types, param,
} from '../service/server';

class DomainRankHandler extends Handler {
    @param('page', Types.PositiveInt, true)
    async get(domainId: string, page = 1) {
        const [dudocs, upcount, ucount] = await paginate(
            domain.getMultiInDomain(domainId).sort({ rp: -1 }),
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
    domain: any;

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
}

class DomainUserHandler extends ManageHandler {
    async get({ domainId }) {
        const rudocs = {};
        const [dudocs, roles] = await Promise.all([
            domain.getMultiInDomain(domainId, {
                $and: [
                    { role: { $ne: 'default' } },
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
            rudocs[ud.role].push(ud);
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

    @param('uid', Types.Int)
    @param('role', Types.String)
    async postSetUser(domainId: string, uid: number, role: string) {
        await domain.setUserRole(domainId, uid, role);
        this.back();
    }
}

class DomainPermissionHandler extends ManageHandler {
    async get({ domainId }) {
        const roles = await domain.getRoles(domainId);
        const log2 = (val: bigint) => {
            // @ts-ignore
            for (let i = 0n; ; i++) {
                // @ts-ignore
                if ((val >> i) === 0n) return parseInt(i.toString(), 10) - 1;
            }
        };
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
        for (const role in this.request.body) {
            if (this.request.body[role] instanceof Array) {
                const perms = this.request.body[role];
                // @ts-ignore
                roles[role] = 0n;
                // @ts-ignore
                for (const r of perms) roles[role] += 1n << BigInt(r);
            }
        }
        await domain.setRoles(domainId, roles);
        this.back();
    }
}

class DomainRoleHandler extends ManageHandler {
    async get({ domainId }) {
        const roles = await domain.getRoles(domainId);
        const path = [
            ['Hydro', 'homepage'],
            ['domain', null],
            ['domain_role', null],
        ];
        this.response.template = 'domain_role.html';
        this.response.body = { roles, domain: this.domain, path };
    }

    @param('role', Types.String)
    async postAdd(domainId: string, role: string) {
        const roles = await domain.getRoles(this.domain);
        const rdict: any = {};
        for (const r of roles) rdict[r._id] = r.perm;
        if (rdict[role]) throw new RoleAlreadyExistError(role);
        await domain.addRole(domainId, role, rdict.default.perm);
        this.back();
    }

    async postDelete({ domainId, roles }) {
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
        const rolesWithText = roles.map((role) => [role, role]);
        const joinSettings = domain.getJoinSettings(this.domain, roles);
        const expirations = { ...domain.JOIN_EXPIRATION_RANGE };
        if (!joinSettings) delete expirations[domain.JOIN_EXPIRATION_KEEP_CURRENT];
        this.response.template = 'domain_join_applications.html';
        this.response.body = { rolesWithText, joinSettings, expirations };
    }

    @param('method', Types.UnsignedInt)
    @param('role', Types.String, true)
    @param('expire', Types.UnsignedInt, true)
    @param('invitationCode', Types.String, true)
    async post(domainId: string, method: number, role: string, expire: number, invitationCode = '') {
        const r = await domain.getRoles(this.domain);
        const roles = r.map((rl) => rl._id);
        const current = domain.getJoinSettings(this.domain, roles);
        if (!domain.JOIN_METHOD_RANGE[method]) throw new ValidationError('method');
        let joinSettings;
        if (method === domain.JOIN_METHOD_NONE) joinSettings = null;
        else {
            if (!roles.includes(role)) throw new ValidationError('role');
            if (!domain.JOIN_EXPIRATION_RANGE[expire]) throw new ValidationError('expire');
            if (!current && expire === domain.JOIN_EXPIRATION_KEEP_CURRENT) throw new ValidationError('expire');
            joinSettings = { method, role };
            if (method === domain.JOIN_METHOD_CODE) joinSettings.code = invitationCode;
            if (expire === domain.JOIN_EXPIRATION_KEEP_CURRENT) {
                joinSettings.expire = current.expire;
            } else if (expire === domain.JOIN_EXPIRATION_UNLIMITED) joinSettings.expire = null;
            else joinSettings.expire = moment().add(expire, 'hours').toDate();
        }
        await domain.edit(this.domain._id, { join: joinSettings });
        this.back();
    }
}

class DomainJoinHandler extends Handler {
    joinSettings: any;

    async prepare() {
        const r = await domain.getRoles(this.domain);
        const roles = r.map((role) => role._id);
        this.joinSettings = domain.getJoinSettings(this.domain, roles);
        if (!this.joinSettings) throw new DomainJoinForbiddenError(this.domain._id);
        if (this.user.role !== 'default') throw new DomainJoinAlreadyMemberError(this.domain._id, this.user._id);
    }

    // @base.require_priv(builtin.PRIV_USER_PROFILE)
    @param('code', Types.String, true)
    async get(domainId: string, code: string) {
        this.response.template = 'domain_join.html';
        this.response.body = { joinSettings: this.joinSettings, code };
    }

    @param('code', Types.String, true)
    async post(domainId: string, code: string) {
        if (this.joinSettings.method === domain.JOIN_METHOD_CODE) {
            if (this.joinSettings.code !== code) {
                throw new InvalidJoinInvitationCodeError(this.domain._id);
            }
        }
        await domain.setUserRole(this.domain._id, this.user._id, this.joinSettings.role);
        this.response.redirect = this.url('domain_main');
    }
}

class DomainSearchHandler extends Handler {
    @param('q', Types.String)
    async get(domainId: string, q: string) {
        const ddocs = await domain.getPrefixSearch(q, 20);
        for (let i = 0; i < ddocs.length; i++) {
            ddocs[i].gravatar = ddocs[i].gravatar ? gravatar(ddocs[i].gravatar) : '/img/team_avatar.png';
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
