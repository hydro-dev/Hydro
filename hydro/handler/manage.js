const system = require('../model/system');
const user = require('../model/user');
const builtin = require('../model/builtin');
const { Route, Handler } = require('../service/server');
const { PERM_ADMIN } = require('../permission');
const { RoleAlreadyExistError } = require('../error');

class ManageHandler extends Handler {
    async prepare() {
        this.checkPerm(PERM_ADMIN);
    }
}

class ManageMainHandler extends ManageHandler {
    async get() {
        this.response.redirect = '/manage/dashboard';
    }
}

class ManageDashboardHandler extends ManageHandler {
    async get() {
        this.response.template = 'domain_manage_dashboard.html';
    }
}

class ManageEditHandler extends ManageHandler {
    async get() {
        this.response.template = 'domain_manage_edit.html';
    }

    async post({ name, gravatar, bulletin }) {
        await Promise.all([
            system.set('name', name),
            system.set('gravatar', gravatar),
            system.set('bulletin', bulletin),
        ]);
        this.back();
    }
}

class ManageUserHandler extends ManageHandler {
    async get() {
        const uids = [];
        const [rudocs, udocs, roles] = await Promise.all([
            system.get(),
            user.getMulti({ role: { $neq: 'default' } }).toArray(),
            user.getRoles(),
        ]);
        for (const udoc of udocs) {
            uids.push(udoc._id);
            rudocs[udoc.role].push(udoc);
        }
        const roles_with_text = roles.map((role) => [role, role]);
        const udict = await user.getList(uids);
        this.response.template = 'domain_manage_user.html';
        this.response.body = {
            roles, roles_with_text, rudocs, udict,
        };
    }

    async postSetUser({ uid, role }) {
        await user.setById(uid, { role });
        this.back();
    }
}

class ManagePermissionHandler extends ManageHandler {
    async get() {
        const roles = await user.getRoles();
        this.response.template = 'domain_manage_permission.html';
        this.response.body = { roles };
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
        const roles = await user.getRoles();
        this.response.template = 'domain_manage_role.html';
        this.response.body = { roles };
    }

    async postAdd({ role }) {
        const roles = await user.getRoles();
        if (roles.includes(role)) throw new RoleAlreadyExistError(role);
        await user.setRole(role, builtin.PERM_DEFAULT);
        this.back();
    }

    async postDelete({ role }) {
        await user.deleteRoles(role);
        this.back();
    }
}

Route('/manage', ManageMainHandler);
Route('/manage/dashboard', ManageDashboardHandler);
Route('/manage/edit', ManageEditHandler);
Route('/manage/user', ManageUserHandler);
Route('/manage/permission', ManagePermissionHandler);
Route('/manage/role', ManageRoleHandler);
