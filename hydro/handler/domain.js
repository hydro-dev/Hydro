const user = require('../model/user');
const domain = require('../model/domain');
const system = require('../model/system');
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
        // eslint-disable-next-line no-await-in-loop
        for (const uid of dudocs.map((dudoc) => dudoc.uid)) {
            udocs.push(user.getById(domainId, uid));
        }
        udocs = await Promise.all(udocs);
        const path = [
            ['Hydro', '/'],
            ['domain_rank', null],
        ];
        this.response.template = 'domain_rank.html';
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
            ['Hydro', '/'],
            ['domain_create', null],
        ];
        this.response.body = { path };
        this.response.template = 'domain_create.html';
    }

    async post({ id, name }) {
        await domain.add(id, this.user._id, name);
        this.response.body = { domainId: id };
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
            ['Hydro', '/'],
            ['domain', '/domain'],
            ['domain_edit', null],
        ];
        this.response.template = 'domain_edit.html';
        this.response.body = { domain: this.domain, path };
    }

    async post({
        domainId, name, gravatar, bulletin,
    }) {
        await domain.edit(domainId, { name, gravatar, bulletin });
        this.response.redirect = '/domain/dashboard';
    }
}

class DomainDashboardHandler extends ManageHandler {
    async get() {
        const path = [
            ['Hydro', '/'],
            ['domain', '/domain'],
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
            user.getInDomain(domainId),
            user.getRoles(domainId),
        ]);
        for (const role of roles) rudocs[role._id] = [];
        for (const udoc of udocs) {
            uids.push(udoc.uid);
            // TODO Improve here
            // eslint-disable-next-line no-await-in-loop
            const ud = await user.getById(domainId, udoc.uid);
            rudocs[udoc.role].push({ ...ud, role: udoc.role });
        }
        const rolesSelect = roles.map((role) => [role._id, role._id]);
        const udict = await user.getList(domainId, uids);
        const path = [
            ['Hydro', '/'],
            ['domain', '/domain'],
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
            ['Hydro', '/'],
            ['domain', '/domain'],
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
            ['Hydro', '/'],
            ['domain', '/domain'],
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
    Route('/ranking', DomainRankHandler);
    Route('/domain/create', DomainCreateHandler);
    Route('/domain/dashboard', DomainDashboardHandler);
    Route('/domain/edit', DomainEditHandler);
    Route('/domain/user', DomainUserHandler);
    Route('/domain/permission', DomainPermissionHandler);
    Route('/domain/role', DomainRoleHandler);
}

global.Hydro.handler.domain = module.exports = apply;
