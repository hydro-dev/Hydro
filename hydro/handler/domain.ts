import { RoleAlreadyExistError, ValidationError, PermissionError } from '../error';
import * as user from '../model/user';
import * as domain from '../model/domain';
import * as system from '../model/system';
import { DOMAIN_SETTINGS, DOMAIN_SETTINGS_BY_KEY } from '../model/setting';
import { PERM, PERMS_BY_FAMILY } from '../model/builtin';
import paginate from '../lib/paginate';
import { Route, Handler } from '../service/server';

class DomainRankHandler extends Handler {
    async get({ domainId, page = 1 }) {
        const [dudocs, upcount, ucount] = await paginate(
            user.getMultiInDomain(domainId).sort({ rating: -1 }),
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

class DomainCreateHandler extends Handler {
    async prepare() {
        if (this.user.priv !== 1) {
            if (!await system.get('user.create_domain')) throw new PermissionError('domain_create');
        }
    }

    async get() {
        const path = [
            ['Hydro', 'homepage'],
            ['domain_create', null],
        ];
        this.response.body = { path };
        this.response.template = 'domain_create.html';
    }

    async post({ id, name }) {
        await domain.add(id, this.user._id, name);
        this.response.body = { domainId: id };
        this.response.redirect = this.url('homepage', { domainId: id });
    }
}

class ManageHandler extends Handler {
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
            user.getMultiInDomain(domainId, {
                $and: [
                    { role: { $ne: 'default' } },
                    { role: { $ne: null } },
                ],
            }).toArray(),
            user.getRoles(domainId),
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
        await user.setRole(domainId, uid, role);
        this.back();
    }
}

class DomainPermissionHandler extends ManageHandler {
    async get({ domainId }) {
        const roles = await user.getRoles(domainId);
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
        await user.setRoles(domainId, roles);
        this.back();
    }
}

class DomainRoleHandler extends ManageHandler {
    async get({ domainId }) {
        const roles = await user.getRoles(domainId);
        const path = [
            ['Hydro', 'homepage'],
            ['domain', null],
            ['domain_role', null],
        ];
        this.response.template = 'domain_role.html';
        this.response.body = { roles, domain: this.domain, path };
    }

    async postAdd({ domainId, role }) {
        const [r, u] = await Promise.all([
            user.getRole(domainId, role),
            user.getRole(domainId, 'default'),
        ]);
        if (r) throw new RoleAlreadyExistError(role);
        await user.addRole(domainId, role, u.perm);
        this.back();
    }

    async postDelete({ domainId, roles }) {
        for (const role of roles) {
            if (['root', 'default', 'guest'].includes(role)) {
                throw new ValidationError('role');
            }
        }
        await user.deleteRoles(domainId, roles);
        this.back();
    }
}

export async function apply() {
    Route('ranking', '/ranking', DomainRankHandler);
    Route('domain_create', '/domain/create', DomainCreateHandler);
    Route('domain_dashboard', '/domain/dashboard', DomainDashboardHandler);
    Route('domain_edit', '/domain/edit', DomainEditHandler);
    Route('domain_user', '/domain/user', DomainUserHandler);
    Route('domain_permission', '/domain/permission', DomainPermissionHandler);
    Route('domain_role', '/domain/role', DomainRoleHandler);
}

global.Hydro.handler.domain = apply;
