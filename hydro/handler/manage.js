const user = require('../model/user');
const system = require('../model/system');
const setting = require('../model/setting');
const { Route, Handler } = require('../service/server');
const { PERM_MANAGE } = require('../permission');
const hpm = require('../lib/hpm');
const loader = require('../loader');
const { RoleAlreadyExistError, ValidationError } = require('../error');

class ManageHandler extends Handler {
    async prepare() {
        this.checkPerm(PERM_MANAGE);
        this.system = await user.getById(0);
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
        this.response.body = { system: this.system, path };
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
        this.response.body = { system: this.system, path };
    }

    async post({ uname, gravatar, bio }) {
        const unameLower = uname.trim().toLowerCase();
        await user.setById(0, {
            uname, unameLower, gravatar, bio,
        });
        this.response.redirect = '/manage/dashboard';
    }
}

class ManageUserHandler extends ManageHandler {
    async get() {
        const uids = [];
        const rudocs = {};
        const [udocs, roles, sys] = await Promise.all([
            user.getMulti({ role: { $nin: ['default', 'guest'] } }).toArray(),
            user.getRoles(),
            user.getById(0),
        ]);
        for (const role of roles) rudocs[role._id] = [];
        for (const udoc of udocs) {
            uids.push(udoc._id);
            rudocs[udoc.role].push(udoc);
        }
        const rolesSelect = roles.map((role) => [role._id, role._id]);
        const udict = await user.getList(uids);
        const path = [
            ['Hydro', '/'],
            ['manage', '/manage'],
            ['manage_user', null],
        ];
        this.response.template = 'manage_user.html';
        this.response.body = {
            roles, rolesSelect, rudocs, udict, system: sys, path,
        };
    }

    async postSetUser({ uid, role }) {
        await user.setRole(uid, role);
        this.back();
    }
}

class ManagePermissionHandler extends ManageHandler {
    async get() {
        const [roles, sys] = await Promise.all([
            user.getRoles(),
            user.getById(0),
        ]);
        const path = [
            ['Hydro', '/'],
            ['manage', '/manage'],
            ['manage_permission', null],
        ];
        this.response.template = 'manage_permission.html';
        this.response.body = { roles, system: sys, path };
    }

    async post({ roles }) {
        for (const role of roles) {
            let perms = '';
            for (const perm of roles) {
                perms += perm;
            }
            roles[role] = perms;
        }
        await user.setRoles(roles);
        this.back();
    }
}

class ManageRoleHandler extends ManageHandler {
    async get() {
        const [roles, sys] = await Promise.all([
            user.getRoles(),
            user.getById(0),
        ]);
        const path = [
            ['Hydro', '/'],
            ['manage', '/manage'],
            ['manage_role', null],
        ];
        this.response.template = 'manage_role.html';
        this.response.body = { roles, system: sys, path };
    }

    async postAdd({ role }) {
        const [r, u] = await Promise.all([
            user.getRole(role),
            user.getRole('default'),
        ]);
        if (r) throw new RoleAlreadyExistError(role);
        await user.addRole(role, u.perm);
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

class ManageModuleHandler extends ManageHandler {
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

class ManageSettingHandler extends ManageHandler {
    async get() {
        this.response.template = 'manage_settings.html';
        const current = {};
        const settings = setting.SYSTEM_SETTINGS;
        for (const s of settings) {
            current[s.key] = await system.get(s.key);
        }
        this.response.body = {
            current, settings,
        };
    }

    async post(args) {
        for (const key in args) {
            await system.set(key, args[key]);
        }
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
    Route('/manage/module', module.exports.ManageModuleHandler);
    Route('/manage/setting', module.exports.ManageSettingHandler);
}

global.Hydro.handler.manage = module.exports = {
    ManageMainHandler,
    ManageDashboardHandler,
    ManageEditHandler,
    ManageUserHandler,
    ManagePermissionHandler,
    ManageRoleHandler,
    ManageModuleHandler,
    ManageSettingHandler,
    apply,
};
