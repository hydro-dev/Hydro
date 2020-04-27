const system = require('../model/system');
const user = require('../model/user');
const builtin = require('../model/builtin');
const { Route, Handler } = require('../service/server');
const { PERM_ADMIN } = require('../permission');
const { RoleAlreadyExistError, ValidationError } = require('../error');

class ManageHandler extends Handler {
    async prepare() {
        this.checkPerm(PERM_ADMIN);
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
        this.response.template = 'domain_manage_dashboard.html';
        this.response.body = { system: this.system };
    }
}

class ManageEditHandler extends ManageHandler {
    async get() {
        this.response.template = 'domain_manage_edit.html';
        this.response.body = { system: this.system };
    }

    async post({ uname, gravatar, bio }) {
        const unameLower = uname.trim().toLowerCase();
        await user.setById(0, {
            uname, unameLower, gravatar, bio,
        });
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
        const r = await user.getRole(role);
        if (r) throw new RoleAlreadyExistError(role);
        await user.addRole(role, builtin.PERM_DEFAULT);
        this.back();
    }

    async postDelete({ roles }) {
        for (const role of roles) {
            if (['admin', 'default', 'guest'].includes(role)) {
                throw new ValidationError('role');
            }
        }
        await user.deleteRoles(roles);
        this.back();
    }
}

Route('/manage', ManageMainHandler);
Route('/manage/dashboard', ManageDashboardHandler);
Route('/manage/edit', ManageEditHandler);
Route('/manage/user', ManageUserHandler);
Route('/manage/permission', ManagePermissionHandler);
Route('/manage/role', ManageRoleHandler);
