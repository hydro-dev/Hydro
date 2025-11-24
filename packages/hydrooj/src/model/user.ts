import { escapeRegExp, omit, pick, uniq } from 'lodash';
import { LRUCache } from 'lru-cache';
import { Collection, Filter, ObjectId } from 'mongodb';
import { serializer } from '@hydrooj/framework';
import { LoginError, UserAlreadyExistError, UserNotFoundError } from '../error';
import {
    Authenticator, BaseUserDict, FileInfo, GDoc,
    OwnerInfo, Udict, Udoc, VUdoc,
} from '../interface';
import avatar from '../lib/avatar';
import pwhash from '../lib/hash.hydro';
import bus from '../service/bus';
import db from '../service/db';
import { Value } from '../typeutils';
import { ArgMethod, buildProjection, randomstring, sleep } from '../utils';
import { PERM, PRIV } from './builtin';
import domain from './domain';
import * as setting from './setting';
import system from './system';
import token from './token';

export const coll: Collection<Udoc> = db.collection('user');
// Virtual user, only for display in contest.
export const collV: Collection<VUdoc> = db.collection('vuser');
export const collGroup: Collection<GDoc> = db.collection('user.group');
const cache = new LRUCache<string, User>({ max: 10000, ttl: 300 * 1000 });

export function deleteUserCache(udoc: { _id: number, uname: string, mail: string } | string | true | undefined | null, receiver = false) {
    if (!udoc) return false;
    if (!receiver) {
        bus.broadcast(
            'user/delcache',
            JSON.stringify(typeof udoc === 'string' ? udoc : pick(udoc, ['uname', 'mail', '_id'])),
        );
    }
    if (udoc === true) return cache.clear();
    if (typeof udoc === 'string') {
        // is domainId
        for (const key of [...cache.keys()].filter((i) => i.endsWith(`/${udoc}`))) cache.delete(key);
        return true;
    }
    const id = [`id/${udoc._id.toString()}`, `name/${udoc.uname.toLowerCase()}`, `mail/${udoc.mail.toLowerCase()}`];
    for (const key of [...cache.keys()].filter((k) => id.includes(`${k.split('/')[0]}/${k.split('/')[1]}`))) {
        cache.delete(key);
    }
    return true;
}
bus.on('user/delcache', (content) => deleteUserCache(typeof content === 'string' ? JSON.parse(content) : content, true));

export class User {
    _id: number;
    _isPrivate = false;

    _udoc: Udoc;
    _dudoc: any;
    _salt: string;
    _hash: string;
    _regip: string;
    _loginip: string;
    _tfa: string;
    _authenticators: Authenticator[];
    _privateFields: string[] = [];
    _publicFields: string[] = [];

    mail: string;
    uname: string;
    hashType: string;
    priv: number;
    regat: Date;
    loginat: Date;
    perm: bigint;
    role: string;
    scope: bigint;
    _files: FileInfo[];
    tfa: boolean;
    authn: boolean;
    group?: string[];
    [key: string]: any;

    constructor(udoc: Udoc, dudoc, scope = PERM.PERM_ALL) {
        this._id = udoc._id;

        this._udoc = udoc;
        this._dudoc = dudoc;
        this._salt = udoc.salt;
        this._hash = udoc.hash;
        this._regip = udoc.ip?.[0] || '';
        this._loginip = udoc.loginip;
        this._files = udoc._files || [];
        this._tfa = udoc.tfa;
        this._authenticators = udoc.authenticators || [];

        this.mail = udoc.mail;
        this.uname = udoc.uname;
        this.hashType = udoc.hashType || 'hydro';
        this.priv = udoc.priv;
        this.regat = udoc.regat;
        this.loginat = udoc.loginat;
        this.perm = dudoc.perm || 0n; // This is a fallback for unknown user
        this.scope = typeof scope === 'string' ? BigInt(scope) : scope;
        this.role = dudoc.role || 'default';
        this.domains = udoc.domains || [];
        this.tfa = !!udoc.tfa;
        this.authn = (udoc.authenticators || []).length > 0;
        if (dudoc.group) this.group = dudoc.group;
        const load = (settings: Record<string, ReturnType<typeof setting.Setting>>, source: any) => {
            for (const key in settings) {
                this[key] = source[key] ?? (settings[key].value || system.get(`preference.${key}`));
                if (settings[key].flag & setting.FLAG_PUBLIC) this._publicFields.push(key);
                if (settings[key].flag & setting.FLAG_PRIVATE) this._privateFields.push(key);
            }
        };
        load(setting.SETTINGS_BY_KEY, udoc);
        load(setting.DOMAIN_USER_SETTINGS_BY_KEY, dudoc);
    }

    async init() {
        await bus.parallel('user/get', this);
        return this;
    }

    own<T extends OwnerInfo>(doc: T, checkPerm: bigint): boolean;
    own<T extends OwnerInfo>(doc: T, exact: boolean): boolean;
    own<T extends OwnerInfo>(doc: T): boolean;
    own<T extends { owner: number, maintainer?: number[] }>(doc: T): boolean;
    own(doc: any, arg1: any = false): boolean {
        if (typeof arg1 === 'bigint' && !this.hasPerm(arg1)) return false;
        return (typeof arg1 === 'boolean' && arg1)
            ? doc.owner === this._id
            : doc.owner === this._id || (doc.maintainer || []).includes(this._id);
    }

    hasPerm(...perms: bigint[]) {
        return perms.some((perm) => (this.perm & this.scope & perm) === perm);
    }

    hasPriv(...privs: number[]) {
        return privs.some((priv) => (this.priv & priv) === priv);
    }

    async checkPassword(password: string) {
        const h = global.Hydro.module.hash[this.hashType];
        if (!h) throw new Error('Unknown hash method');
        const result = await h(password, this._salt, this);
        if (result !== true && result !== this._hash) {
            throw new LoginError(this.uname);
        }
        if (this.hashType !== 'hydro') {
            // eslint-disable-next-line ts/no-use-before-define
            UserModel.setPassword(this._id, password);
        }
    }

    async private() {
        const user = await new User(this._udoc, this._dudoc, this.scope).init();
        user.avatarUrl = avatar(user.avatar, 128);
        if (user.pinnedDomains instanceof Array) {
            const result = await Promise.allSettled(user.pinnedDomains.slice(0, 10).map((i) => domain.get(i)));
            user.domains = result.map((i) => (i.status === 'fulfilled' ? i.value : null)).filter((i) => i);
        }
        user._isPrivate = true;
        return user;
    }

    getFields(type: 'public' | 'private' = 'public') {
        const fields = ['_id', 'uname', 'mail', 'perm', 'role', 'priv', 'regat', 'loginat', 'tfa', 'authn', 'avatar'].concat(this._publicFields);
        return type === 'public' ? fields : fields.concat(this._privateFields);
    }

    serialize(h) {
        if (!this._isPrivate) {
            return pick(this, this.getFields(h?.user?.hasPerm(PERM.PERM_VIEW_USER_PRIVATE_INFO) ? 'private' : 'public'));
        }
        return JSON.stringify(this, serializer(true, h));
    }
}

declare module '@hydrooj/framework' {
    interface UserModel extends User { }
}

export function handleMailLower(mail: string) {
    const [n, d] = mail.trim().toLowerCase().split('@');
    const [name] = n.split('+');
    return `${name.replace(/\./g, '')}@${d === 'googlemail.com' ? 'gmail.com' : d}`;
}

async function initAndCache(udoc: Udoc, dudoc, scope: bigint = PERM.PERM_ALL) {
    const res = await new User(udoc, dudoc, scope).init();
    cache.set(`id/${udoc._id}/${dudoc.domainId}`, res);
    cache.set(`name/${udoc.unameLower}/${dudoc.domainId}`, res);
    cache.set(`mail/${udoc.mailLower}/${dudoc.domainId}`, res);
    return res;
}

class UserModel {
    static coll = coll;
    static collGroup = collGroup;
    static User = User;
    static cache = cache;
    static defaultUser: Udoc = {
        _id: 0,
        uname: 'Unknown User',
        unameLower: 'unknown user',
        avatar: 'gravatar:unknown@hydro.local',
        mail: 'unknown@hydro.local',
        mailLower: 'unknown@hydro.local',
        salt: '',
        hash: '',
        hashType: 'hydro',
        priv: 0,
        perm: 0n,
        regat: new Date('2000-01-01'),
        loginat: new Date('2000-01-01'),
        ip: ['127.0.0.1'],
        loginip: '127.0.0.1',
    };

    static _handleMailLower = handleMailLower;
    static _deleteUserCache = deleteUserCache;

    @ArgMethod
    static async getById(domainId: string, _id: number, scope: bigint | string = PERM.PERM_ALL): Promise<User> {
        if (cache.has(`id/${_id}/${domainId}`)) return cache.get(`id/${_id}/${domainId}`) || null;
        const udoc = await (_id < -999 ? collV : coll).findOne({ _id });
        if (!udoc) return null;
        const [dudoc, groups] = await Promise.all([
            domain.getDomainUser(domainId, udoc),
            UserModel.listGroup(domainId, _id),
        ]);
        dudoc.group = groups.map((i) => i.name);
        if (typeof scope === 'string') scope = BigInt(scope);
        return initAndCache(udoc, dudoc, scope);
    }

    static async getList(domainId: string, uids: number[]): Promise<Udict> {
        const r: Udict = {};
        await Promise.all(uniq(uids).map(async (uid) => {
            r[uid] = (await UserModel.getById(domainId, uid)) || new User(UserModel.defaultUser, {});
        }));
        return r;
    }

    @ArgMethod
    static async getByUname(domainId: string, uname: string): Promise<User | null> {
        const unameLower = uname.trim().toLowerCase();
        if (cache.has(`name/${unameLower}/${domainId}`)) return cache.get(`name/${unameLower}/${domainId}`);
        const udoc = (await coll.findOne({ unameLower })) || await collV.findOne({ unameLower });
        if (!udoc) return null;
        const dudoc = await domain.getDomainUser(domainId, udoc);
        return initAndCache(udoc, dudoc);
    }

    @ArgMethod
    static async getByEmail(domainId: string, mail: string): Promise<User> {
        const mailLower = handleMailLower(mail);
        if (cache.has(`mail/${mailLower}/${domainId}`)) return cache.get(`mail/${mailLower}/${domainId}`);
        const udoc = await coll.findOne({ mailLower });
        if (!udoc) return null;
        const dudoc = await domain.getDomainUser(domainId, udoc);
        return initAndCache(udoc, dudoc);
    }

    @ArgMethod
    static async setById(uid: number, $set?: Partial<Udoc>, $unset?: Value<Partial<Udoc>, ''>, $push?: any) {
        if (uid < -999) return null;
        const op: any = {};
        if ($set && Object.keys($set).length) op.$set = $set;
        if ($unset && Object.keys($unset).length) op.$unset = $unset;
        if ($push && Object.keys($push).length) op.$push = $push;
        if (op.$set?.loginip) op.$addToSet = { ip: op.$set.loginip };
        const keys = new Set(Object.values(op).flatMap((i) => Object.keys(i)));
        if (keys.has('mailLower') || keys.has('unameLower')) {
            const udoc = await coll.findOne({ _id: uid });
            deleteUserCache(udoc);
        }
        const res = await coll.findOneAndUpdate({ _id: uid }, op, { returnDocument: 'after' });
        deleteUserCache(res);
        return res;
    }

    @ArgMethod
    static setUname(uid: number, uname: string) {
        return UserModel.setById(uid, { uname, unameLower: uname.trim().toLowerCase() });
    }

    @ArgMethod
    static setEmail(uid: number, mail: string) {
        return UserModel.setById(uid, { mail, mailLower: handleMailLower(mail) });
    }

    @ArgMethod
    static async setPassword(uid: number, password: string): Promise<Udoc> {
        const salt = randomstring();
        const res = await coll.findOneAndUpdate(
            { _id: uid },
            { $set: { salt, hash: await pwhash(password, salt), hashType: 'hydro' } },
            { returnDocument: 'after' },
        );
        deleteUserCache(res);
        return res;
    }

    @ArgMethod
    static async inc(_id: number | number[], field: string, n: number = 1) {
        const ids = (Array.isArray(_id) ? Array.from(new Set(_id)) : [_id]).filter((i) => i >= -999);
        if (!ids.length) return null;
        const udocs = await coll.find({ _id: { $in: ids } }).toArray();
        if (udocs.length !== ids.length) throw new UserNotFoundError(_id);
        await coll.updateMany({ _id: { $in: ids } }, { $inc: { [field]: n } });
        for (const udoc of udocs) deleteUserCache(udoc);
        return udocs;
    }

    @ArgMethod
    static async create(
        mail: string, uname: string, password: string,
        uid?: number, regip: string = '127.0.0.1', priv: number = system.get('default.priv'),
    ) {
        let autoAlloc = false;
        if (typeof uid !== 'number') {
            const [udoc] = await coll.find({}).sort({ _id: -1 }).limit(1).toArray();
            uid = Math.max((udoc?._id || 0) + 1, 2);
            autoAlloc = true;
        }
        const salt = randomstring();
        while (true) {
            try {
                // eslint-disable-next-line no-await-in-loop
                await coll.insertOne({
                    _id: uid,
                    mail,
                    mailLower: handleMailLower(mail),
                    uname,
                    unameLower: uname.trim().toLowerCase(),
                    // eslint-disable-next-line no-await-in-loop
                    hash: await pwhash(password.toString(), salt),
                    salt,
                    hashType: 'hydro',
                    regat: new Date(),
                    ip: [regip],
                    loginat: new Date(),
                    loginip: regip,
                    priv,
                    avatar: `gravatar:${mail}`,
                });
                // eslint-disable-next-line no-await-in-loop
                await domain.collUser.updateOne(
                    { uid, domainId: 'system' },
                    { $set: { join: true } },
                    { upsert: true },
                );
                // make sure user is immediately available after creation
                // give some time for database to sync in replicas
                for (let i = 1; i <= 10; i++) {
                    const udoc = await UserModel.getById('system', uid); // eslint-disable-line no-await-in-loop
                    if (udoc) break;
                    await sleep(500); // eslint-disable-line no-await-in-loop
                }
                return uid;
            } catch (e) {
                if (e?.code === 11000) {
                    // Duplicate Key Error
                    if (autoAlloc && JSON.stringify(e.keyPattern) === '{"_id":1}') {
                        uid++;
                        continue;
                    }
                    throw new UserAlreadyExistError(Object.values(e?.keyValue || {}));
                }
                throw e;
            }
        }
    }

    @ArgMethod
    static async ensureVuser(uname: string) {
        const [[min], current] = await Promise.all([
            collV.find({}).sort({ _id: 1 }).limit(1).toArray(),
            collV.findOne({ unameLower: uname.toLowerCase() }),
        ]);
        if (current) return current._id;
        const uid = min?._id ? min._id - 1 : -1000;
        await collV.insertOne({
            _id: uid,
            mail: `${-uid}@vuser.local`,
            mailLower: `${-uid}@vuser.local`,
            uname,
            unameLower: uname.trim().toLowerCase(),
            hash: '',
            salt: '',
            hashType: 'hydro',
            regat: new Date(),
            ip: ['127.0.0.1'],
            loginat: new Date(),
            loginip: '127.0.0.1',
            priv: 0,
        });
        return uid;
    }

    static getMulti(params: Filter<Udoc> = {}, projection?: (keyof Udoc)[]) {
        return projection ? coll.find(params).project<Udoc>(buildProjection(projection)) : coll.find(params);
    }

    static async getListForRender(domainId: string, uids: number[], showPrivateInfo: boolean, extraFields?: string[]): Promise<BaseUserDict>;
    static async getListForRender(domainId: string, uids: number[], extraFields?: string[]): Promise<BaseUserDict>;
    static async getListForRender(domainId: string, uids: number[], arg: string[] | boolean, extraFields?: string[]) {
        const _extraFields = Array.isArray(arg) ? arg : Array.isArray(extraFields) ? extraFields : [];
        const showPrivateInfo = arg === true || _extraFields.includes('displayName');
        const fields = Array.from(new Set([
            ...(await UserModel.getById('system', 0)).getFields(showPrivateInfo ? 'private' : 'public'),
            ..._extraFields,
        ]));
        const [udocs, vudocs, dudocs] = await Promise.all([
            UserModel.getMulti({ _id: { $in: uids } }, fields).toArray(),
            collV.find({ _id: { $in: uids } }).toArray(),
            domain.getDomainUserMulti(domainId, uids).project(buildProjection(fields.concat('uid'))).toArray(),
        ]);
        const udict = {};
        for (const udoc of udocs) udict[udoc._id] = udoc;
        for (const udoc of vudocs) udict[udoc._id] = udoc;
        if (showPrivateInfo) {
            for (const dudoc of dudocs) Object.assign(udict[dudoc.uid], omit(dudoc, ['_id', 'uid']));
        }
        for (const uid of uids) udict[uid] ||= { ...UserModel.defaultUser };
        for (const key in udict) {
            udict[key].school ||= '';
            udict[key].studentId ||= '';
            udict[key].displayName ||= udict[key].uname;
            udict[key].avatar ||= `gravatar:${udict[key].mail}`;
        }
        return udict as BaseUserDict;
    }

    @ArgMethod
    static async getPrefixList(domainId: string, prefix: string, limit: number = 50) {
        const $regex = `^${escapeRegExp(prefix.toLowerCase())}`;
        const udocs = await coll.find({ unameLower: { $regex } })
            .limit(limit).project({ _id: 1 }).toArray();
        const dudocs = await domain.getMultiUserInDomain(domainId, { displayName: { $regex } }).limit(limit).project({ uid: 1 }).toArray();
        const uids = uniq([...udocs.map(({ _id }) => _id), ...dudocs.map(({ uid }) => uid)]);
        return await Promise.all(uids.map((_id) => UserModel.getById(domainId, _id)));
    }

    @ArgMethod
    static async setPriv(uid: number, priv: number): Promise<Udoc> {
        const res = await coll.findOneAndUpdate(
            { _id: uid },
            { $set: { priv } },
            { returnDocument: 'after' },
        );
        deleteUserCache(res);
        return res;
    }

    @ArgMethod
    static async setSuperAdmin(uid: number) {
        return await UserModel.setPriv(uid, PRIV.PRIV_ALL);
    }

    @ArgMethod
    static async setJudge(uid: number) {
        return await UserModel.setPriv(
            uid,
            PRIV.PRIV_USER_PROFILE | PRIV.PRIV_JUDGE | PRIV.PRIV_VIEW_ALL_DOMAIN
            | PRIV.PRIV_READ_PROBLEM_DATA | PRIV.PRIV_UNLIMITED_ACCESS,
        );
    }

    @ArgMethod
    static ban(uid: number, reason = '') {
        return Promise.all([
            UserModel.setById(uid, { priv: PRIV.PRIV_NONE, banReason: reason }),
            token.delByUid(uid),
        ]);
    }

    static async listGroup(domainId: string, uid?: number) {
        const groups = await collGroup.find(typeof uid === 'number' ? { domainId, uids: uid } : { domainId }).toArray();
        if (uid) {
            groups.push({
                _id: new ObjectId(), domainId, uids: [uid], name: uid.toString(),
            });
        }
        return groups;
    }

    static delGroup(domainId: string, name: string) {
        deleteUserCache(domainId);
        return collGroup.deleteOne({ domainId, name });
    }

    static updateGroup(domainId: string, name: string, uids: number[]) {
        deleteUserCache(domainId);
        return collGroup.updateOne({ domainId, name }, { $set: { uids } }, { upsert: true });
    }
}

export async function apply() {
    await Promise.all([
        db.ensureIndexes(
            coll,
            { key: { unameLower: 1 }, name: 'uname', unique: true },
            { key: { mailLower: 1 }, name: 'mail', unique: true },
        ),
        db.ensureIndexes(
            collV,
            { key: { unameLower: 1 }, name: 'uname', unique: true },
            { key: { mailLower: 1 }, name: 'mail', unique: true },
        ),
        db.ensureIndexes(
            collGroup,
            { key: { domainId: 1, name: 1 }, name: 'name', unique: true },
            { key: { domainId: 1, uids: 1 }, name: 'uid' },
        ),
    ]);
}
export default UserModel;
global.Hydro.model.user = UserModel;
