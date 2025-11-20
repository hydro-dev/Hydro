import { load } from 'js-yaml';
import { Dictionary } from 'lodash';
import moment from 'moment-timezone';
import Schema from 'schemastery';
import type { Context } from '../context';
import {
    CannotDeleteSystemDomainError, DomainJoinAlreadyMemberError, DomainJoinForbiddenError, ForbiddenError,
    InvalidJoinInvitationCodeError, NotFoundError, OnlyOwnerCanDeleteDomainError, PermissionError, RoleAlreadyExistError, ValidationError,
} from '../error';
import type { DomainDoc } from '../interface';
import avatar from '../lib/avatar';
import { PERM, PERMS_BY_FAMILY, PRIV } from '../model/builtin';
import * as discussion from '../model/discussion';
import domain from '../model/domain';
import MessageModel from '../model/message';
import * as oplog from '../model/oplog';
import { DOMAIN_SETTINGS, DOMAIN_SETTINGS_BY_KEY } from '../model/setting';
import system from '../model/system';
import user from '../model/user';
import {
    Handler, Mutation, param, post, Query, query, requireSudo, Types,
} from '../service/server';
import { log2 } from '../utils';

class DomainRankHandler extends Handler {
    @query('page', Types.PositiveInt, true)
    async get(domainId: string, page = 1) {
        const [dudocs, upcount, ucount] = await this.paginate(
            domain.getMultiUserInDomain(domainId, { uid: { $gt: 1 }, rp: { $gt: 0 } }).sort({ rp: -1 }),
            page,
            'ranking',
        );
        const udict = await user.getList(domainId, dudocs.map((dudoc) => dudoc.uid));
        const udocs = dudocs.map((i) => udict[i.uid]);
        this.response.template = 'ranking.html';
        this.response.body = {
            udocs, upcount, ucount, page,
        };
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
        this.response.template = 'domain_edit.html';
        this.response.body = { current: this.domain, settings: DOMAIN_SETTINGS };
    }

    async post(args) {
        if (args.operation) return;
        const $set = {};
        const booleanKeys = args.booleanKeys || {};
        delete args.booleanKeys;
        for (const key in booleanKeys) if (!args[key]) $set[key] = false;
        for (const key in args) {
            if (DOMAIN_SETTINGS_BY_KEY[key]) $set[key] = args[key];
        }
        await domain.edit(args.domainId, $set);
        this.response.redirect = this.url('domain_dashboard');
    }
}

class DomainDashboardHandler extends ManageHandler {
    async get() {
        const owner = await user.getById(this.domain._id, this.domain.owner);
        this.response.template = 'domain_dashboard.html';
        this.response.body = { domain: this.domain, owner };
    }

    async postInitDiscussionNode({ domainId }) {
        const nodes = load(system.get('discussion.nodes'));
        await discussion.flushNodes(domainId);
        for (const category of Object.keys(nodes)) {
            for (const item of nodes[category]) {
                // eslint-disable-next-line no-await-in-loop
                const curr = await discussion.getNode(domainId, item.name);
                // eslint-disable-next-line no-await-in-loop
                if (!curr) await discussion.addNode(domainId, item.name, category, item.pic ? { pic: item.pic } : undefined);
            }
        }
        this.back();
    }

    @requireSudo
    async postDelete({ domainId }) {
        if (domainId === 'system') throw new CannotDeleteSystemDomainError();
        if (this.domain.owner !== this.user._id) throw new OnlyOwnerCanDeleteDomainError();
        await Promise.all([
            domain.del(domainId),
            oplog.log(this, 'domain.delete', {}),
        ]);
        this.response.redirect = this.url('home_domain', { domainId: 'system' });
    }
}

class DomainUserHandler extends ManageHandler {
    @requireSudo
    @param('format', Types.Range(['default', 'raw']), true)
    async get({ domainId }, format = 'default') {
        const [dudocs, roles] = await Promise.all([
            domain.collUser.aggregate([
                {
                    $match: {
                        // TODO: add a page to display users who joined but with default role
                        role: {
                            $nin: ['default', 'guest'],
                            $ne: null,
                        },
                        domainId,
                    },
                },
                {
                    $lookup: {
                        from: 'user',
                        let: { uid: '$uid' },
                        pipeline: [
                            {
                                $match: {
                                    $expr: { $eq: ['$_id', '$$uid'] },
                                    priv: { $bitsAllSet: PRIV.PRIV_USER_PROFILE },
                                },
                            },
                            {
                                $project: {
                                    _id: 1,
                                    uname: 1,
                                    avatar: 1,
                                },
                            },
                        ],
                        as: 'user',
                    },
                },
                { $unwind: '$user' },
                {
                    $project: {
                        user: 1,
                        role: 1,
                        join: 1,
                        ...(this.user.hasPerm(PERM.PERM_VIEW_USER_PRIVATE_INFO) ? { displayName: 1 } : {}),
                    },
                },
            ]).toArray(),
            domain.getRoles(domainId),
        ]);
        const users = dudocs.map((dudoc) => {
            const u = {
                ...dudoc,
                ...dudoc.user,
            };
            delete u.user;
            return u;
        });
        const rudocs = {};
        for (const role of roles) rudocs[role._id] = users.filter((udoc) => udoc.role === role._id);
        this.response.template = format === 'raw' ? 'domain_user_raw.html' : 'domain_user.html';
        this.response.body = {
            roles, rudocs, domain: this.domain,
        };
    }

    @param('uids', Types.NumericArray)
    async post({ }, uids: number[]) {
        if (uids.includes(this.domain.owner)) throw new ForbiddenError();
    }

    @requireSudo
    @param('uids', Types.NumericArray)
    @param('role', Types.Role)
    @param('join', Types.Boolean)
    async postSetUsers(domainId: string, uid: number[], role: string, join = false) {
        if (join && !system.get('server.allowInvite')) this.checkPriv(PRIV.PRIV_MANAGE_ALL_DOMAIN);
        await Promise.all([
            domain.setUserRole(domainId, uid, role),
            oplog.log(this, 'domain.setRole', { uid, role, join }),
        ]);
        if (join) await domain.setJoin(domainId, uid, true);
        this.back();
    }

    @requireSudo
    @param('uids', Types.NumericArray)
    async postKick({ domainId }, uids: number[]) {
        const original = await domain.getMultiUserInDomain(domainId, { uid: { $in: uids } }).toArray();
        const needUpdate = uids.filter((uid) => original.find((i) => i.uid === uid)?.join);
        if (!needUpdate.length) return;
        const target = needUpdate.length > 1 ? needUpdate : needUpdate[0];
        await Promise.all([
            domain.setJoin(domainId, target, false),
            domain.setUserRole(domainId, target, 'guest'),
            oplog.log(this, 'domain.kick', { uids: needUpdate }),
        ]);
        const msg = JSON.stringify({
            message: 'You have been kicked from domain {0} by {1}.',
            params: [this.domain.name, this.user.uname],
        });
        await Promise.all(needUpdate.map((i) => MessageModel.send(1, i, msg, MessageModel.FLAG_RICHTEXT | MessageModel.FLAG_UNREAD)));
        this.back();
    }
}

class DomainPermissionHandler extends ManageHandler {
    @requireSudo
    async get({ domainId }) {
        const roles = await domain.getRoles(domainId);
        this.response.template = 'domain_permission.html';
        this.response.body = {
            roles, PERMS_BY_FAMILY, domain: this.domain, log2,
        };
    }

    @requireSudo
    async post({ domainId }) {
        const roles = {};
        for (const role in this.request.body) {
            if (role === 'root') continue; // root role is not editable
            const perms = this.request.body[role] instanceof Array
                ? this.request.body[role]
                : [this.request.body[role]];
            roles[role] = 0n;
            for (const r of perms) roles[role] |= 1n << BigInt(r);
        }
        await Promise.all([
            domain.setRoles(domainId, roles),
            oplog.log(this, 'domain.setRoles', { roles }),
        ]);
        this.back();
    }
}

class DomainRoleHandler extends ManageHandler {
    @requireSudo
    async get({ domainId }) {
        const roles = await domain.getRoles(domainId, true);
        this.response.template = 'domain_role.html';
        this.response.body = { roles, domain: this.domain };
    }

    @param('role', Types.Role)
    async postAdd(domainId: string, role: string) {
        const roles = await domain.getRoles(this.domain);
        const rdict: Dictionary<any> = {};
        for (const r of roles) rdict[r._id] = r.perm;
        if (rdict[role]) throw new RoleAlreadyExistError(role);
        await Promise.all([
            domain.addRole(domainId, role, rdict.default),
            oplog.log(this, 'domain.addRole', { role }),
        ]);
        this.back();
    }

    @requireSudo
    @param('roles', Types.ArrayOf(Types.Role))
    async postDelete(domainId: string, roles: string[]) {
        if (Set.intersection(roles, ['root', 'default', 'guest']).size > 0) {
            throw new ValidationError('role', null, 'You cannot delete root, default or guest roles');
        }
        await Promise.all([
            domain.deleteRoles(domainId, roles),
            oplog.log(this, 'domain.deleteRoles', { roles }),
        ]);
        this.back();
    }
}

class DomainJoinApplicationsHandler extends ManageHandler {
    async get() {
        const r = await domain.getRoles(this.domain);
        const roles = r.map((role) => role._id).sort();
        this.response.body.rolesWithText = roles.filter((i) => i !== 'guest').map((role) => [role, role]);
        this.response.body.joinSettings = domain.getJoinSettings(this.domain, roles);
        this.response.body.expirations = { ...domain.JOIN_EXPIRATION_RANGE };
        if (!this.response.body.joinSettings) {
            delete this.response.body.expirations[domain.JOIN_EXPIRATION_KEEP_CURRENT];
        }
        this.response.body.url_prefix = (this.domain.host || [])[0] || system.get('server.url');
        if (!this.response.body.url_prefix.endsWith('/')) this.response.body.url_prefix += '/';
        this.response.template = 'domain_join_applications.html';
    }

    @requireSudo
    @post('method', Types.Range([domain.JOIN_METHOD_NONE, domain.JOIN_METHOD_ALL, domain.JOIN_METHOD_CODE]))
    @post('role', Types.Role, true)
    @post('group', Types.Name, true)
    @post('expire', Types.Int, true)
    @post('invitationCode', Types.Content, true)
    async post(domainId: string, method: number, role: string, group = '', expire: number, invitationCode = '') {
        const r = await domain.getRoles(this.domain);
        const roles = r.map((rl) => rl._id);
        const current = domain.getJoinSettings(this.domain, roles);
        let joinSettings;
        if (method === domain.JOIN_METHOD_NONE) joinSettings = null;
        else {
            if (!roles.includes(role)) throw new ValidationError('role');
            if (!current && expire === domain.JOIN_EXPIRATION_KEEP_CURRENT) throw new ValidationError('expire');
            joinSettings = { method, role, group };
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

class DomainUserGroupHandler extends ManageHandler {
    async get({ domainId }) {
        this.response.template = 'domain_group.html';
        this.response.body = {
            domain: this.domain,
            groups: await user.listGroup(domainId),
        };
    }

    @param('name', Types.Name)
    async postDel(domainId: string, name: string) {
        await user.delGroup(domainId, name);
        this.back();
    }

    @param('name', Types.Name)
    @param('uids', Types.NumericArray)
    async postUpdate(domainId: string, name: string, uids: number[]) {
        await user.updateGroup(domainId, name, uids);
        this.back();
    }
}

class DomainJoinHandler extends Handler {
    joinSettings: any;
    noCheckPermView = true;

    @param('target', Types.DomainId, true)
    async prepare({ domainId }, target: string = domainId) {
        const [ddoc, dudoc] = await Promise.all([
            domain.get(target),
            domain.collUser.findOne({ domainId: target, uid: this.user._id }),
        ]);
        if (!ddoc) throw new NotFoundError(target);
        const assignedRole = this.user.hasPriv(PRIV.PRIV_MANAGE_ALL_DOMAIN)
            ? 'root'
            : dudoc?.role || 'default';
        if (dudoc?.join) throw new DomainJoinAlreadyMemberError(target, this.user._id);
        const r = await domain.getRoles(ddoc);
        const roles = r.map((role) => role._id);
        this.joinSettings = domain.getJoinSettings(ddoc, roles);
        if (assignedRole !== 'default') delete this.joinSettings;
        else if (!this.joinSettings) throw new DomainJoinForbiddenError(target, 'The link is either invalid or expired.');
        if (assignedRole === 'guest') throw new DomainJoinForbiddenError(target, 'You are banned by the domain moderator.');
    }

    @param('code', Types.Content, true)
    @param('target', Types.DomainId, true)
    @param('redirect', Types.Content, true)
    async get({ domainId }, code: string, target: string = domainId, redirect: string = '') {
        this.response.template = 'domain_join.html';
        const ddoc = await domain.get(target);
        const domainInfo = {
            name: ddoc.name,
            owner: await user.getById(domainId, ddoc.owner),
            avatar: ddoc.avatar,
            bulletin: ddoc.showBulletin ? ddoc.bulletin : '',
        };
        this.response.body = {
            joinSettings: this.joinSettings,
            code,
            redirect,
            target,
            domainInfo,
        };
    }

    @param('code', Types.Content, true)
    @param('target', Types.DomainId, true)
    @param('redirect', Types.Content, true)
    async post({ domainId }, code: string, target: string = domainId, redirect: string = '') {
        if (this.joinSettings?.method === domain.JOIN_METHOD_CODE) {
            if (this.joinSettings.code !== code) {
                throw new InvalidJoinInvitationCodeError(target);
            }
        }
        if (this.joinSettings?.group) {
            const groups = await user.listGroup(target);
            const entry = groups.find((i) => i.name === this.joinSettings.group);
            if (!entry) throw new ValidationError('group');
            await user.updateGroup(target, entry.name, entry.uids.concat(this.user._id));
        }
        await Promise.all([
            domain.setUserInDomain(target, this.user._id, {
                join: true,
                ...(this.joinSettings ? { role: this.joinSettings.role } : {}),
            }),
            oplog.log(this, 'domain.join', {}),
        ]);
        this.response.redirect = redirect || this.url('homepage', { domainId: target, query: { notification: 'Successfully joined domain.' } });
    }
}

class DomainSearchHandler extends Handler {
    @param('q', Types.Content, true)
    async get(domainId: string, q: string = '') {
        let ddocs: DomainDoc[] = [];
        if (!q) {
            const dudict = await domain.getDictUserByDomainId(this.user._id);
            const dids = Object.keys(dudict);
            ddocs = await domain.getMulti({ _id: { $in: dids } }).toArray();
        } else ddocs = await domain.getPrefixSearch(q, 20);
        for (let i = 0; i < ddocs.length; i++) {
            ddocs[i].avatarUrl = ddocs[i].avatar ? avatar(ddocs[i].avatar, 64) : '/img/team_avatar.png';
        }
        this.response.body = ddocs;
    }
}

export const DomainApi = {
    domain: Query(
        Schema.object({
            id: Schema.string(),
        }),
        async (ctx, args) => {
            const ddoc = args.id ? await domain.get(args.id) : ctx.domain;
            if (!ddoc) return null;
            const udoc = await user.getById(ddoc._id, ctx.user._id);
            if (!udoc.hasPerm(PERM.PERM_VIEW) && !udoc.hasPriv(PRIV.PRIV_VIEW_ALL_DOMAIN)) return null;
            return ddoc;
        },
    ),
    groups: Query(
        Schema.object({
            search: Schema.string(),
            names: Schema.array(Schema.string()),
            domainId: Schema.string().required(),
        }),
        async (ctx, args) => {
            if (!ctx.user.hasPerm(PERM.PERM_VIEW) && !ctx.user.hasPriv(PRIV.PRIV_VIEW_ALL_DOMAIN)) throw new PermissionError(PERM.PERM_VIEW);
            const groups = await user.listGroup(args.domainId);
            if (args.names?.length) {
                return groups.filter((g) => args.names.includes(g.name));
            }
            if (args.search) {
                const searchLower = args.search.toLowerCase();
                return groups.filter((g) => g.name.toLowerCase().includes(searchLower));
            }
            return groups;
        },
    ),
    'domain.group': Mutation(
        Schema.object({
            name: Schema.string().required(),
            uids: Schema.array(Schema.number()),
        }),
        async (ctx, args) => {
            if (!ctx.user.hasPerm(PERM.PERM_EDIT_DOMAIN)) throw new PermissionError(PERM.PERM_EDIT_DOMAIN);
            if (args.uids?.length) {
                const res = await user.updateGroup(ctx.domain._id, args.name, args.uids);
                return res.upsertedCount > 0;
            }
            const res = await user.delGroup(ctx.domain._id, args.name);
            return res.deletedCount > 0;
        },
    ),
} as const;

declare module '@hydrooj/framework' {
    interface Apis {
        domain: typeof DomainApi;
    }
}

export async function apply(ctx: Context) {
    ctx.Route('ranking', '/ranking', DomainRankHandler, PERM.PERM_VIEW_RANKING);
    ctx.Route('domain_dashboard', '/domain/dashboard', DomainDashboardHandler);
    ctx.Route('domain_edit', '/domain/edit', DomainEditHandler);
    ctx.Route('domain_user', '/domain/user', DomainUserHandler);
    ctx.Route('domain_permission', '/domain/permission', DomainPermissionHandler);
    ctx.Route('domain_role', '/domain/role', DomainRoleHandler);
    ctx.Route('domain_group', '/domain/group', DomainUserGroupHandler);
    ctx.Route('domain_join_applications', '/domain/join_applications', DomainJoinApplicationsHandler);
    ctx.Route('domain_join', '/domain/join', DomainJoinHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('domain_search', '/domain/search', DomainSearchHandler, PRIV.PRIV_USER_PROFILE);
    await ctx.inject(['api'], ({ api }) => {
        api.provide(DomainApi);
    });
}
