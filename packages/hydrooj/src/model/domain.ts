import { Dictionary, escapeRegExp } from 'lodash';
import { LRUCache } from 'lru-cache';
import { Filter } from 'mongodb';
import { Context } from '../context';
import { DomainDoc } from '../interface';
import bus from '../service/bus';
import db from '../service/db';
import { MaybeArray, NumberKeys } from '../typeutils';
import { ArgMethod } from '../utils';
import { BUILTIN_ROLES, PRIV } from './builtin';
import UserModel, { deleteUserCache } from './user';

const coll = db.collection('domain');
const collUser = db.collection('domain.user');
const cache = new LRUCache<string, DomainDoc>({ max: 1000, ttl: 300 * 1000 });

interface DomainUserArg {
    _id: number;
    priv: number;
}

class DomainModel {
    static coll = coll;
    static collUser = collUser;

    static JOIN_METHOD_NONE = 0;
    static JOIN_METHOD_ALL = 1;
    static JOIN_METHOD_CODE = 2;

    static JOIN_METHOD_RANGE = {
        [DomainModel.JOIN_METHOD_NONE]: 'No user is allowed to join this domain',
        [DomainModel.JOIN_METHOD_ALL]: 'Any user is allowed to join this domain',
        [DomainModel.JOIN_METHOD_CODE]: 'Any user is allowed to join this domain with an invitation code',
    };

    static JOIN_EXPIRATION_KEEP_CURRENT = 0;
    static JOIN_EXPIRATION_UNLIMITED = -1;

    static JOIN_EXPIRATION_RANGE = {
        [DomainModel.JOIN_EXPIRATION_KEEP_CURRENT]: 'Keep current expiration',
        3: 'In 3 hours',
        24: 'In 1 day',
        [24 * 3]: 'In 3 days',
        [24 * 7]: 'In 1 week',
        [24 * 30]: 'In 1 month',
        [DomainModel.JOIN_EXPIRATION_UNLIMITED]: 'Never expire',
    };

    @ArgMethod
    static async add(domainId: string, owner: number, name: string, bulletin: string) {
        const ddoc: DomainDoc = {
            _id: domainId,
            lower: domainId.toLowerCase(),
            owner,
            name,
            bulletin,
            roles: {},
            avatar: '',
        };
        await bus.parallel('domain/create', ddoc);
        await coll.insertOne(ddoc);
        await DomainModel.setUserRole(domainId, owner, 'root', true);
        return domainId;
    }

    @ArgMethod
    static async get(domainId: string): Promise<DomainDoc | null> {
        domainId = domainId.toLowerCase();
        const key = `id::${domainId}`;
        if (cache.has(key)) return cache.get(key);
        const query: Filter<DomainDoc> = { lower: domainId };
        await bus.parallel('domain/before-get', query);
        const result = await coll.findOne(query);
        if (result) {
            await bus.parallel('domain/get', result);
            cache.set(key, result);
        }
        return result;
    }

    @ArgMethod
    static async getByHost(host: string): Promise<DomainDoc | null> {
        const key = `host::${host}`;
        // Note: cache by host might not be updated immediately
        if (cache.has(key)) return cache.get(key);
        const query: Filter<DomainDoc> = { host };
        await bus.parallel('domain/before-get', query);
        const result = await coll.findOne(query);
        if (result) {
            await bus.parallel('domain/get', result);
            cache.set(key, result);
        }
        return result;
    }

    static getMulti(query: Filter<DomainDoc> = {}) {
        return coll.find(query);
    }

    static async edit(domainId: string, $set: Partial<DomainDoc>) {
        domainId = domainId.toLowerCase();
        await bus.parallel('domain/before-update', domainId, $set);
        const result = await coll.findOneAndUpdate({ lower: domainId }, { $set }, { returnDocument: 'after' });
        if (result) {
            await bus.parallel('domain/update', domainId, $set, result);
            bus.broadcast('domain/delete-cache', domainId);
        }
        return result;
    }

    @ArgMethod
    static async inc(domainId: string, field: NumberKeys<DomainDoc>, n: number): Promise<number | null> {
        domainId = domainId.toLowerCase();
        const value = await coll.findOneAndUpdate(
            { _id: domainId },
            { $inc: { [field]: n } as any },
            { returnDocument: 'after' },
        );
        bus.broadcast('domain/delete-cache', domainId);
        return value?.[field];
    }

    @ArgMethod
    static async getList(domainIds: string[]) {
        const r: Record<string, DomainDoc | null> = {};
        await Promise.all(domainIds.map((domainId) => DomainModel.get(domainId).then((ddoc) => { r[domainId] = ddoc; })));
        return r;
    }

    static async countUser(domainId: string, role?: string) {
        if (role) return await collUser.countDocuments({ domainId, role, join: true });
        return await collUser.countDocuments({ domainId, join: true });
    }

    @ArgMethod
    static async setUserRole(domainId: string, uid: MaybeArray<number>, role: string, autojoin = false) {
        const update = { $set: { role, ...(autojoin ? { join: true } : {}) } };
        if (!(Array.isArray(uid))) {
            const res = await collUser.findOneAndUpdate(
                { domainId, uid },
                update,
                { upsert: true, returnDocument: 'after', includeResultMetadata: true },
            );
            const udoc = await UserModel.getById(domainId, uid);
            deleteUserCache(udoc);
            return res;
        }
        const affected = await UserModel.getMulti({ _id: { $in: uid } })
            .project<{ _id: number, mail: string, uname: string }>({ mail: 1, uname: 1 })
            .toArray();
        for (const udoc of affected) deleteUserCache(udoc);
        return await collUser.updateMany({ domainId, uid: { $in: uid } }, update, { upsert: true });
    }

    static async setJoin(domainId: string, uid: MaybeArray<number>, join: boolean) {
        if (!(Array.isArray(uid))) {
            await DomainModel.updateUserInDomain(domainId, uid, { $set: { join } });
            return;
        }
        await collUser.updateMany({ domainId, uid: { $in: uid } }, { $set: { join } });
        deleteUserCache(domainId);
    }

    static async getRoles(domainId: string, count?: boolean): Promise<any[]>;
    static async getRoles(domain: DomainDoc, count?: boolean): Promise<any[]>;
    @ArgMethod
    static async getRoles(arg: string | DomainDoc, count: boolean = false) {
        let ddoc: DomainDoc;
        if (typeof arg === 'string') ddoc = await DomainModel.get(arg);
        else ddoc = arg;
        const roles = [];
        const r = [];
        for (const role in ddoc.roles) {
            roles.push({ _id: role, perm: BigInt(ddoc.roles[role]) });
            r.push(role);
        }
        for (const role in BUILTIN_ROLES) {
            if (!r.includes(role)) {
                roles.push({ _id: role, perm: BUILTIN_ROLES[role] });
            }
        }
        if (count) {
            await Promise.all(roles.filter((i) => i._id !== 'guest').map(async (role) => {
                role.count = await DomainModel.countUser(ddoc._id, role._id);
            }));
        }
        return roles;
    }

    static async setRoles(domainId: string, roles: Dictionary<bigint | string>) {
        const current = await DomainModel.get(domainId);
        for (const role in roles) {
            current.roles[role] = roles[role].toString();
        }
        deleteUserCache(domainId);
        bus.broadcast('domain/delete-cache', domainId.toLowerCase());
        return await coll.updateOne({ _id: domainId }, { $set: { roles: current.roles } });
    }

    static async addRole(domainId: string, name: string, permission: bigint) {
        const current = await DomainModel.get(domainId);
        current.roles[name] = permission.toString();
        bus.broadcast('domain/delete-cache', domainId.toLowerCase());
        return await coll.updateOne({ _id: domainId }, { $set: { roles: current.roles } });
    }

    static async deleteRoles(domainId: string, roles: string[]) {
        const current = await DomainModel.get(domainId);
        for (const role of roles) delete current.roles[role];
        await Promise.all([
            coll.updateOne({ _id: domainId }, { $set: current }),
            collUser.updateMany({ domainId, role: { $in: roles } }, { $set: { role: 'default' } }),
        ]);
        deleteUserCache(domainId);
        bus.broadcast('domain/delete-cache', domainId.toLowerCase());
    }

    static async getDomainUser(domainId: string, udoc: DomainUserArg) {
        let dudoc = await collUser.findOne({ domainId, uid: udoc._id });
        dudoc ||= { domainId, uid: udoc._id };
        if (!(udoc.priv & PRIV.PRIV_USER_PROFILE)) dudoc.role = 'guest';
        if (!dudoc.join && !(udoc.priv & PRIV.PRIV_VIEW_ALL_DOMAIN)) dudoc.role = 'guest';
        if (udoc.priv & PRIV.PRIV_MANAGE_ALL_DOMAIN) dudoc.role = 'root';
        dudoc.role ||= 'default';
        const ddoc = await DomainModel.get(domainId);
        dudoc.perm = ddoc?.roles[dudoc.role]
            ? BigInt(ddoc?.roles[dudoc.role])
            : BUILTIN_ROLES[dudoc.role];
        return dudoc;
    }

    static getDomainUserMulti(domainId: string, uids: number[]) {
        return collUser.find({ domainId, uid: { $in: uids } });
    }

    static setMultiUserInDomain(domainId: string, query: any, params: any) {
        deleteUserCache(domainId);
        return collUser.updateMany({ domainId, ...query }, { $set: params }, { upsert: true });
    }

    static getMultiUserInDomain(domainId: string, query: any = {}) {
        return collUser.find({ domainId, ...query });
    }

    static async setUserInDomain(domainId: string, uid: number, params: any) {
        const udoc = await UserModel.getById(domainId, uid);
        deleteUserCache(udoc);
        return await collUser.updateOne({ domainId, uid }, { $set: params }, { upsert: true });
    }

    static async updateUserInDomain(domainId: string, uid: number, update: any) {
        const udoc = await UserModel.getById(domainId, uid);
        deleteUserCache(udoc);
        return await collUser.updateOne({ domainId, uid }, update, { upsert: true });
    }

    @ArgMethod
    static async incUserInDomain(domainId: string, uid: number, field: string, n: number = 1) {
        // @ts-ignore
        const dudoc = await DomainModel.getDomainUser(domainId, { _id: uid });
        dudoc[field] = dudoc[field] + n || n;
        await DomainModel.setUserInDomain(domainId, uid, { [field]: dudoc[field] });
        return dudoc;
    }

    @ArgMethod
    static async getDictUserByDomainId(uid: number) {
        const dudocs = await collUser.find({ uid, join: true }).toArray();
        const dudict: Record<string, any> = {};
        for (const dudoc of dudocs) dudict[dudoc.domainId] = dudoc;
        return dudict;
    }

    static getJoinSettings(ddoc: DomainDoc, roles: string[]) {
        if (!ddoc._join) return null;
        const joinSettings = ddoc._join;
        if (joinSettings.method === DomainModel.JOIN_METHOD_NONE) return null;
        if (!roles.includes(joinSettings.role)) return null;
        if (joinSettings.expire && joinSettings.expire < new Date()) return null;
        return joinSettings;
    }

    @ArgMethod
    static async getPrefixSearch(prefix: string, limit: number = 50) {
        const $regex = new RegExp(escapeRegExp(prefix), 'im');
        const ddocs = await coll.find({
            $or: [{ _id: { $regex } }, { name: { $regex } }],
        }).limit(limit).toArray();
        return ddocs;
    }

    @ArgMethod
    static async del(domainId: string) {
        await coll.deleteOne({ _id: domainId });
        await collUser.deleteMany({ domainId });
        await bus.parallel('domain/delete', domainId);
        bus.broadcast('domain/delete-cache', domainId.toLowerCase());
    }
}

export async function apply(ctx: Context) {
    ctx.on('domain/delete-cache', async (domainId: string) => {
        const ddoc = await DomainModel.get(domainId);
        if (!ddoc) return;
        for (const host of ddoc.host || []) {
            cache.delete(`host::${host}`);
        }
        cache.delete(`id::${domainId}`);
    });
    await Promise.all([
        db.ensureIndexes(
            coll,
            { key: { lower: 1 }, name: 'lower', unique: true },
        ),
        db.ensureIndexes(
            collUser,
            { key: { domainId: 1, uid: 1 }, name: 'uid', unique: true },
            { key: { domainId: 1, rp: -1, uid: 1 }, name: 'rp', sparse: true },
        ),
    ]);
}
export default DomainModel;
global.Hydro.model.domain = DomainModel;
