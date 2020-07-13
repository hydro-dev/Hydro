import { RoleAlreadyExistError, ValidationError } from '../error';
import * as user from '../model/user';
import * as domain from '../model/domain';
import { DOMAIN_SETTINGS, DOMAIN_SETTINGS_BY_KEY } from '../model/setting';
import { PERM, PERMS_BY_FAMILY } from '../model/builtin';
import paginate from '../lib/paginate';
import {
    Route, Handler, Types, param,
} from '../service/server';

class DomainRankHandler extends Handler {
    @param('page', Types.UnsignedInt, true)
    async get(domainId: string, page = 1) {
        const [dudocs, upcount, ucount] = await paginate(
            domain.getMultiInDomain(domainId).sort({ rating: -1 }),
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

    async postSetUser({ domainId, uid, role }) {
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
            roles, PERMS_BY_FAMILY, domain: this.domain, path,
        };
    }

    async post({ domainId }) {
        const roles = {};
        for (const role in this.request.body) {
            if (this.request.body[role] instanceof Array) {
                roles[role] = this.request.body[role].join('');
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

    async postAdd({ domainId, role }) {
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

export async function apply() {
    Route('ranking', '/ranking', DomainRankHandler);
    Route('domain_dashboard', '/domain/dashboard', DomainDashboardHandler);
    Route('domain_edit', '/domain/edit', DomainEditHandler);
    Route('domain_user', '/domain/user', DomainUserHandler);
    Route('domain_permission', '/domain/permission', DomainPermissionHandler);
    Route('domain_role', '/domain/role', DomainRoleHandler);
}

global.Hydro.handler.domain = apply;
