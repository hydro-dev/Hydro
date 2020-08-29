import { Dictionary } from 'lodash';
import { Collection } from 'mongodb';
import { BUILTIN_ROLES, PRIV } from './builtin';
import { DomainDoc } from '../interface';
import * as db from '../service/db';

const coll: Collection<DomainDoc> = db.collection('domain');
const collUser = db.collection('domain.user');

export const JOIN_METHOD_NONE = 0;
export const JOIN_METHOD_ALL = 1;
export const JOIN_METHOD_CODE = 2;
export const JOIN_METHOD_RANGE = {
    [JOIN_METHOD_NONE]: 'No user is allowed to join this domain',
    [JOIN_METHOD_ALL]: 'Any user is allowed to join this domain',
    [JOIN_METHOD_CODE]: 'Any user is allowed to join this domain with an invitation code',
};

export const JOIN_EXPIRATION_KEEP_CURRENT = 0;
export const JOIN_EXPIRATION_UNLIMITED = -1;

export const JOIN_EXPIRATION_RANGE = {
    [JOIN_EXPIRATION_KEEP_CURRENT]: 'Keep current expiration',
    3: 'In 3 hours',
    24: 'In 1 day',
    [24 * 3]: 'In 3 days',
    [24 * 7]: 'In 1 week',
    [24 * 30]: 'In 1 month',
    [JOIN_EXPIRATION_UNLIMITED]: 'Never expire',
};

export async function add(domainId: string, owner: number, name: string, bulletin: string) {
    const ddoc: DomainDoc = {
        _id: domainId,
        owner,
        name,
        bulletin,
        roles: {},
        gravatar: '',
        pidCounter: 0,
    };
    await coll.insertOne(ddoc);
    return domainId;
}

export function get(domainId: string): Promise<DomainDoc | null> {
    return coll.findOne({ _id: domainId });
}

export function getMulti(query: any = {}) {
    return coll.find(query);
}

export function edit(domainId: string, $set: any) {
    return coll.updateOne({ _id: domainId }, { $set });
}

export async function inc(domainId: string, field: keyof DomainDoc, n: number): Promise<number | null> {
    const res = await coll.findOneAndUpdate(
        { _id: domainId },
        // FIXME
        // @ts-ignore
        { $inc: { [field]: n } },
        { returnOriginal: false },
    );
    return res.value[field];
}

export async function getList(domainIds: string[]): Promise<Dictionary<DomainDoc>> {
    const r = {};
    // eslint-disable-next-line no-await-in-loop
    for (const domainId of domainIds) r[domainId] = await get(domainId);
    return r;
}

export function setUserRole(domainId: string, uid: number, role: string) {
    return collUser.updateOne({ uid, domainId }, { $set: { role } }, { upsert: true });
}

export async function getRoles(domainId: string): Promise<any[]>
export async function getRoles(domain: DomainDoc): Promise<any[]>
export async function getRoles(arg: string | DomainDoc) {
    let ddoc: DomainDoc;
    if (typeof arg === 'string') ddoc = await get(arg);
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
    return roles;
}

export async function setRoles(domainId: string, roles: Dictionary<bigint>) {
    const current = await get(domainId);
    for (const role in roles) {
        current.roles[role] = roles[role].toString();
    }
    return await coll.updateOne({ _id: domainId }, { $set: { roles: current.roles } });
}

export async function addRole(domainId: string, name: string, permission: bigint) {
    const current = await get(domainId);
    current.roles[name] = permission.toString();
    return await coll.updateOne({ _id: domainId }, { $set: { roles: current.roles } });
}

export async function deleteRoles(domainId: string, roles: string[]) {
    const current = await get(domainId);
    for (const role of roles) delete current.roles[role];
    await Promise.all([
        coll.updateOne({ _id: domainId }, { $set: current }),
        collUser.updateMany({ domainId, role: { $in: roles } }, { $set: { role: 'default' } }),
    ]);
}

interface DomainUserArg {
    _id: number,
    priv: number,
}
export async function getDomainUser(domainId: string, udoc: DomainUserArg) {
    let dudoc = await collUser.findOne({ domainId, uid: udoc._id });
    dudoc = dudoc || {};
    if (!(udoc.priv & PRIV.PRIV_USER_PROFILE)) dudoc.role = 'guest';
    if (udoc.priv & PRIV.PRIV_MANAGE_ALL_DOMAIN) dudoc.role = 'admin';
    dudoc.role = dudoc.role || 'default';
    const ddoc = await get(domainId);
    dudoc.perm = ddoc.roles[dudoc.role]
        ? BigInt(ddoc.roles[dudoc.role])
        : BUILTIN_ROLES[dudoc.role];
    return dudoc;
}

export function setMultiUserInDomain(domainId: string, query: any, params: any) {
    return collUser.updateMany({ domainId, ...query }, { $set: params });
}

export function getMultiUserInDomain(domainId: string, query: any = {}) {
    return collUser.find({ domainId, ...query });
}

export function setUserInDomain(domainId: string, uid: number, params: any) {
    return collUser.updateOne({ domainId, uid }, { $set: params });
}

export async function incUserInDomain(domainId: string, uid: number, field: string, n = 1) {
    // @ts-ignore
    const dudoc = await getDomainUser(domainId, { _id: uid });
    dudoc[field] = dudoc[field] + n || n;
    await setUserInDomain(domainId, uid, { [field]: dudoc[field] });
    return dudoc;
}

export async function getDictUserByDomainId(uid: number) {
    const dudocs = await collUser.find({ uid }).toArray();
    const ddocs = await coll.find({ owner: uid }).toArray();
    const dudict = {};
    for (const dudoc of dudocs) {
        // eslint-disable-next-line no-await-in-loop
        dudict[dudoc.domainId] = await get(dudoc.domainId);
    }
    for (const ddoc of ddocs) {
        dudict[ddoc._id] = ddoc;
    }
    return dudict;
}

export function getJoinSettings(ddoc: DomainDoc, roles: string[]) {
    if (!ddoc.join) return null;
    const joinSettings = ddoc.join;
    if (joinSettings.method === JOIN_METHOD_NONE) return null;
    if (!roles.includes(joinSettings.role)) return null;
    if (joinSettings.expire && joinSettings.expire < new Date()) return null;
    return joinSettings;
}

export async function getPrefixSearch(prefix: string, limit = 50) {
    const $regex = new RegExp(prefix, 'mi');
    const ddocs = await coll.find({
        $or: [{ _id: { $regex } }, { name: { $regex } }],
    }).limit(limit).toArray();
    return ddocs;
}

global.Hydro.model.domain = {
    JOIN_METHOD_NONE,
    JOIN_METHOD_ALL,
    JOIN_METHOD_CODE,
    JOIN_METHOD_RANGE,
    JOIN_EXPIRATION_KEEP_CURRENT,
    JOIN_EXPIRATION_UNLIMITED,
    JOIN_EXPIRATION_RANGE,

    getRoles,
    add,
    inc,
    get,
    edit,
    getMulti,
    getList,
    setRoles,
    addRole,
    deleteRoles,
    setUserRole,
    getDomainUser,
    setMultiUserInDomain,
    setUserInDomain,
    incUserInDomain,
    getMultiUserInDomain,
    getDictUserByDomainId,
    getJoinSettings,
    getPrefixSearch,
};
