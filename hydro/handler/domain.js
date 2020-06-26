const user = require('../model/user');
const domain = require('../model/domain');
const system = require('../model/system');
const { DOMAIN_SETTINGS, DOMAIN_SETTINGS_BY_KEY } = require('../model/setting');
const paginate = require('../lib/paginate');
const { Route, Handler } = require('../service/server');
const { PERM_MANAGE } = require('../permission');
const { RoleAlreadyExistError, ValidationError, PermissionError } = require('../error');

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
        this.checkPerm(PERM_MANAGE);
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
        const uids = [];
        const rudocs = {};
        const [udocs, roles] = await Promise.all([
            user.getMultiInDomain(domainId, {
                $and: [
                    { role: { $ne: 'default' } },
                    { role: { $ne: null } },
                ],
            }).toArray(),
            user.getRoles(domainId),
        ]);
        for (const role of roles) rudocs[role._id] = [];
        for (const udoc of udocs) {
            uids.push(udoc.uid);
            const ud = user.getById(domainId, udoc.uid);
            rudocs[ud.role].push(ud);
        }
        const tasks = [];
        for (const key in rudocs) tasks.push(Promise.all(rudocs[key]));
        await Promise.all(tasks);
        const rolesSelect = roles.map((role) => [role._id, role._id]);
        const udict = await user.getList(domainId, uids);
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
        this.response.body = { roles, domain: this.domain, path };
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

    async postDelete({ roles }) {
        for (const role of roles) {
            if (['root', 'default', 'guest'].includes(role)) {
                throw new ValidationError('role');
            }
        }
        await user.deleteRoles(roles);
        this.back();
    }
}

async function apply() {
    Route('ranking', '/ranking', DomainRankHandler);
    Route('domain_create', '/domain/create', DomainCreateHandler);
    Route('domain_dashboard', '/domain/dashboard', DomainDashboardHandler);
    Route('domain_edit', '/domain/edit', DomainEditHandler);
    Route('domain_user', '/domain/user', DomainUserHandler);
    Route('domain_permission', '/domain/permission', DomainPermissionHandler);
    Route('domain_role', '/domain/role', DomainRoleHandler);
}

global.Hydro.handler.domain = module.exports = apply;
