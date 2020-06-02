const user = require('../model/user');
const domain = require('../model/domain');
const setting = require('../model/setting');
const system = require('../model/system');
const { Route, Handler } = require('../service/server');
const { PERM_MANAGE } = require('../permission');
const hpm = require('../lib/hpm');
const loader = require('../loader');
const { RoleAlreadyExistError, ValidationError, PermissionError } = require('../error');

class ManageHandler extends Handler {
    async prepare({ domainId }) {
        this.checkPerm(PERM_MANAGE);
        this.domain = await domain.get(domainId);
    }
}

class ManageMainHandler extends ManageHandler {
    async get() {
        this.response.redirect = '/manage/dashboard';
    }
}

class ManageDashboardHandler extends ManageHandler {
    async get() {
        const path = [
            ['Hydro', '/'],
            ['manage', '/manage'],
            ['manage_dashboard', null],
        ];
        this.response.template = 'manage_dashboard.html';
        this.response.body = { domain: this.domain, path };
    }
}

class ManageEditHandler extends ManageHandler {
    async get() {
        const path = [
            ['Hydro', '/'],
            ['manage', '/manage'],
            ['manage_edit', null],
        ];
        this.response.template = 'manage_edit.html';
        this.response.body = { domain: this.domain, path };
    }

    async post({
        domainId, name, gravatar, bulletin,
    }) {
        await domain.edit(domainId, { name, gravatar, bulletin });
        this.response.redirect = '/manage/dashboard';
    }
}

class ManageUserHandler extends ManageHandler {
    async get({ domainId }) {
        // FIXME(masnn) UPDATE CODE
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
            ['manage', '/manage'],
            ['manage_user', null],
        ];
        this.response.template = 'manage_user.html';
        this.response.body = {
            roles, rolesSelect, rudocs, udict, path,
        };
    }

    async postSetUser({ domainId, uid, role }) {
        await user.setRole(domainId, uid, role);
        this.back();
    }
}

class ManagePermissionHandler extends ManageHandler {
    async get({ domainId }) {
        const [roles, d] = await Promise.all([
            user.getRoles(domainId),
            domain.get(domainId),
        ]);
        const path = [
            ['Hydro', '/'],
            ['manage', '/manage'],
            ['manage_permission', null],
        ];
        this.response.template = 'manage_permission.html';
        this.response.body = { roles, domain: d, path };
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

class ManageRoleHandler extends ManageHandler {
    async get({ domainId }) {
        const [roles, d] = await Promise.all([
            user.getRoles(domainId),
            domain.get(domainId),
        ]);
        const path = [
            ['Hydro', '/'],
            ['manage', '/manage'],
            ['manage_role', null],
        ];
        this.response.template = 'manage_role.html';
        this.response.body = { roles, domain: d, path };
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

class SystemHandler extends Handler {
    async prepare() {
        if (!this.user.priv) throw new PermissionError('???');
    }
}

class SystemModuleHandler extends SystemHandler {
    async get() {
        const installed = await hpm.getInstalled();
        const path = [
            ['Hydro', '/'],
            ['manage', '/manage'],
            ['manage_module', null],
        ];
        this.response.body = { installed, active: loader.active, path };
        this.response.template = 'manage_module.html';
    }

    async postInstall({ url, id }) {
        await hpm.install(url, id);
        this.back();
    }

    async postDelete({ id }) {
        await hpm.del(id);
        this.back();
    }
}

class SystemSettingHandler extends SystemHandler {
    async get() {
        this.response.template = 'manage_settings.html';
        const current = {};
        const settings = setting.SYSTEM_SETTINGS;
        for (const s of settings) {
            current[s.key] = await system.get(s.key);
        }
        this.response.body = { current, settings };
    }

    async post(args) {
        const tasks = [];
        for (const key in args) {
            if (typeof args[key] === 'object') {
                const subtasks = [];
                for (const sub in args[key]) {
                    subtasks.push(system.set(`${key}.${sub}`, args[key][sub]));
                }
                tasks.push(Promise.all(subtasks));
            } else tasks.push(system.set(key, args[key]));
        }
        await Promise.all(tasks);
        this.back();
    }
}

async function apply() {
    Route('/manage', module.exports.ManageMainHandler);
    Route('/manage/dashboard', module.exports.ManageDashboardHandler);
    Route('/manage/edit', module.exports.ManageEditHandler);
    Route('/manage/user', module.exports.ManageUserHandler);
    Route('/manage/permission', module.exports.ManagePermissionHandler);
    Route('/manage/role', module.exports.ManageRoleHandler);
    Route('/manage/module', SystemModuleHandler);
    Route('/manage/setting', SystemSettingHandler);
}

global.Hydro.handler.manage = module.exports = {
    ManageMainHandler,
    ManageDashboardHandler,
    ManageEditHandler,
    ManageUserHandler,
    ManagePermissionHandler,
    ManageRoleHandler,
    SystemModuleHandler,
    SystemSettingHandler,
    apply,
};
