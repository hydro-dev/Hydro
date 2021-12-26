import { Dictionary } from 'lodash';
import { FilterQuery } from 'mongodb';
import { DomainDoc } from '../interface';
import * as bus from '../service/bus';
import db from '../service/db';
import { MaybeArray, NumberKeys } from '../typeutils';
import { ArgMethod } from '../utils';
import { BUILTIN_ROLES, PRIV } from './builtin';
import UserModel, { deleteUserCache } from './user';

const coll = db.collection('domain');
const collUser = db.collection('domain.user');
const collUnion = db.collection('domain.union');

interface DomainUserArg {
    _id: number,
    priv: number,
}

class DomainModel {
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
        await bus.serial('domain/create', ddoc);
        await coll.insertOne(ddoc);
        await DomainModel.setUserRole(domainId, owner, 'root');
        return domainId;
    }

    @ArgMethod
    static async get(domainId: string): Promise<DomainDoc | null> {
        const query: FilterQuery<DomainDoc> = { lower: domainId.toLowerCase() };
        await bus.serial('domain/before-get', query);
        const result = await coll.findOne(query);
        if (result) await bus.serial('domain/get', result);
        return result;
    }

    @ArgMethod
    static async getByHost(host: string): Promise<DomainDoc | null> {
        const query: FilterQuery<DomainDoc> = { host };
        await bus.serial('domain/before-get', query);
        const result = await coll.findOne(query);
        if (result) await bus.serial('domain/get', result);
        return result;
    }

    static getMulti(query: FilterQuery<DomainDoc> = {}) {
        return coll.find(query);
    }

    static async edit(domainId: string, $set: Partial<DomainDoc>) {
        await bus.serial('domain/before-update', domainId, $set);
        const result = await coll.findOneAndUpdate({ _id: domainId }, { $set }, { returnDocument: 'after' });
        if (result.value) await bus.serial('domain/update', domainId, $set, result.value);
        return result.value;
    }

    @ArgMethod
    static async inc(domainId: string, field: NumberKeys<DomainDoc>, n: number): Promise<number | null> {
        const res = await coll.findOneAndUpdate(
            { _id: domainId },
            // FIXME
            // @ts-expect-error
            { $inc: { [field]: n } },
            { returnDocument: 'after' },
        );
        return res.value?.[field];
    }

    @ArgMethod
    static async getList(domainIds: string[]) {
        const r: Record<string, DomainDoc | null> = {};
        const tasks = [];
        for (const domainId of domainIds) tasks.push(DomainModel.get(domainId).then((ddoc) => { r[domainId] = ddoc; }));
        await Promise.all(tasks);
        return r;
    }

    static async countUser(domainId: string, role?: string) {
        if (role) return await collUser.find({ domainId, role }).count();
        return await collUser.find({ domainId }).count();
    }

    @ArgMethod
    static async setUserRole(domainId: string, uid: MaybeArray<number>, role: string) {
        if (!(uid instanceof Array)) {
            const res = await collUser.findOneAndUpdate({ domainId, uid }, { $set: { role } }, { upsert: true, returnDocument: 'after' });
            const udoc = await UserModel.getById(domainId, uid);
            deleteUserCache(udoc);
            return res;
        }
        const affected = await UserModel.getMulti({ _id: { $in: uid } }).project({ mail: 1, uname: 1 }).toArray();
        affected.forEach((udoc) => deleteUserCache(udoc));
        return await collUser.updateMany({ domainId, uid: { $in: uid } }, { $set: { role } }, { upsert: true });
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
            await Promise.all(roles.map(async (role) => {
                if (['default', 'guest'].includes(role._id)) return role;
                role.count = await DomainModel.countUser(ddoc._id, role._id);
                return role;
            }));
        }
        return roles;
    }

    static async setRoles(domainId: string, roles: Dictionary<bigint | string>) {
        deleteUserCache(domainId);
        const current = await DomainModel.get(domainId);
        for (const role in roles) {
            current.roles[role] = roles[role].toString();
        }
        return await coll.updateOne({ _id: domainId }, { $set: { roles: current.roles } });
    }

    static async addRole(domainId: string, name: string, permission: bigint) {
        const current = await DomainModel.get(domainId);
        current.roles[name] = permission.toString();
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
    }

    static async getDomainUser(domainId: string, udoc: DomainUserArg) {
        let dudoc = await collUser.findOne({ domainId, uid: udoc._id });
        dudoc = dudoc || {};
        if (!(udoc.priv & PRIV.PRIV_USER_PROFILE)) dudoc.role = 'guest';
        if (udoc.priv & PRIV.PRIV_MANAGE_ALL_DOMAIN) dudoc.role = 'root';
        dudoc.role = dudoc.role || 'default';
        const ddoc = await DomainModel.get(domainId);
        dudoc.perm = ddoc?.roles[dudoc.role]
            ? BigInt(ddoc?.roles[dudoc.role])
            : BUILTIN_ROLES[dudoc.role];
        return dudoc;
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
        const dudocs = await collUser.find({ uid }).toArray();
        const dudict = {};
        for (const dudoc of dudocs) {
            // eslint-disable-next-line no-await-in-loop
            dudict[dudoc.domainId] = await DomainModel.get(dudoc.domainId);
            dudict[dudoc.domainId].role = dudoc.role;
        }
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
        const $regex = new RegExp(prefix, 'mi');
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
    }

    @ArgMethod
    static async addUnion(domainId: string, union: string[]) {
        return await collUnion.updateOne({ _id: domainId }, { $set: { union } }, { upsert: true });
    }

    @ArgMethod
    static async removeUnion(domainId: string) {
        return await collUnion.deleteOne({ _id: domainId });
    }

    @ArgMethod
    static async getUnion(domainId: string) {
        return await collUnion.findOne({ _id: domainId });
    }

    @ArgMethod
    static async searchUnion(query) {
        return await collUnion.find(query).toArray();
    }
}

bus.once('app/started', async () => {
    await db.ensureIndexes(
        coll,
        { key: { lower: 1 }, name: 'lower', unique: true },
    );
    await db.ensureIndexes(
        collUser,
        { key: { domainId: 1, uid: 1 }, name: 'uid', unique: true },
        { key: { domainId: 1, uid: 1, rp: -1 }, name: 'rp', sparse: true },
    );
});
export default DomainModel;
global.Hydro.model.domain = DomainModel;
