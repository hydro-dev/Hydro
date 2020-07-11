import * as document from './document';
import * as system from './system';
import * as token from './token';
import * as setting from './setting';
import { BUILTIN_ROLES, BUILTIN_USERS, PRIV } from './builtin';
import { UserNotFoundError, UserAlreadyExistError, LoginError } from '../error';
import pwhash from '../lib/hash.hydro';
import * as db from '../service/db';

const coll = db.collection('user');

export function setPassword(uid: number, password: string) {
    const salt = String.random();
    return coll.findOneAndUpdate(
        { _id: uid },
        { $set: { salt, hash: pwhash(password, salt), hashType: 'hydro' } },
    );
}

export class User {
    udoc: () => any;

    dudoc: () => any;

    _id: number;

    mail: string;

    uname: string;

    salt: () => string;

    hash: () => string;

    hashType: string;

    priv: number;

    regat: Date;

    loginat: Date;

    perm: string;

    role: string;

    regip: () => string;

    loginip: () => string;

    constructor(udoc, dudoc) {
        this.udoc = () => udoc;
        this.dudoc = () => dudoc;
        this._id = udoc._id;
        this.mail = udoc.mail;
        this.uname = udoc.uname;
        this.salt = () => udoc.salt;
        this.hash = () => udoc.hash;
        this.hashType = udoc.hashType || 'hydro';
        this.priv = udoc.priv;
        this.regat = udoc.regat;
        this.regip = () => udoc.regip;
        this.loginat = udoc.loginat;
        this.loginip = () => udoc.loginip;
        this.perm = dudoc.perm;
        this.role = dudoc.role || 'default';

        for (const key in setting.SETTINGS_BY_KEY) {
            if (udoc[key]) this[key] = udoc[key];
            else if (setting.SETTINGS_BY_KEY[key].value) {
                this[key] = setting.SETTINGS_BY_KEY[key].value;
            }
        }

        for (const key in setting.DOMAIN_USER_SETTINGS_BY_KEY) {
            if (dudoc[key]) this[key] = dudoc[key];
            else if (setting.DOMAIN_USER_SETTINGS_BY_KEY[key].value) {
                this[key] = setting.DOMAIN_USER_SETTINGS_BY_KEY[key].value;
            }
        }
    }

    hasPerm(p: string) {
        return this.perm.includes(p);
    }

    hasPriv(p: number) {
        return this.priv & p;
    }

    checkPassword(password: string) {
        const h = global.Hydro.lib[`hash.${this.hashType}`];
        if (!h) throw new Error('Unknown hash method');
        if (!(h(password, this.salt(), this) === this.hash())) {
            throw new LoginError(this.uname);
        } else if (this.hashType !== 'hydro') {
            setPassword(this._id, password);
        }
    }
}

export async function getInDomain(domainId: string, udoc: User) {
    let dudoc = await document.getStatus(domainId, document.TYPE_DOMAIN_USER, 0, udoc._id);
    dudoc = dudoc || {};
    if (udoc._id === 1) dudoc.role = 'guest';
    if (udoc.priv & PRIV.PRIV_MANAGE_ALL_DOMAIN) dudoc.role = 'admin';
    const p = await document.get(domainId, document.TYPE_DOMAIN_USER, dudoc.role || 'default');
    dudoc.perm = p ? p.content : BUILTIN_ROLES[dudoc.role || 'default'].perm;
    return dudoc;
}

export async function getById(domainId: string, _id: number, throwError = false) {
    const udoc = _id === 0 || _id === 1
        ? BUILTIN_USERS[_id]
        : await coll.findOne({ _id });
    if (!udoc) {
        if (throwError) throw new UserNotFoundError(_id);
        else return null;
    }
    const dudoc = await getInDomain(domainId, udoc);
    return new User(udoc, dudoc);
}

export async function getList(domainId: string, uids: number[]) {
    const _uids = new Set(uids);
    const r = {};
    // eslint-disable-next-line no-await-in-loop
    for (const uid of _uids) r[uid] = await getById(domainId, uid);
    return r;
}

export async function getByUname(domainId: string, uname: string, ignoreMissing = false) {
    const unameLower = uname.trim().toLowerCase();
    const udoc = (unameLower === 'guest')
        ? BUILTIN_USERS[0]
        : unameLower === 'hydro'
            ? BUILTIN_USERS[1]
            : await coll.findOne({ unameLower });
    if (!udoc) {
        if (ignoreMissing) return null;
        throw new UserNotFoundError(uname);
    }
    const dudoc = await getInDomain(domainId, udoc);
    return new User(udoc, dudoc);
}

export async function getByEmail(domainId: string, mail: string, ignoreMissing = false) {
    const mailLower = mail.trim().toLowerCase();
    const udoc = (mailLower === 'guest@hydro.local')
        ? BUILTIN_USERS[0]
        : mailLower === 'hydro@hydro.local'
            ? BUILTIN_USERS[1]
            : await coll.findOne({ mailLower });
    if (!udoc) {
        if (ignoreMissing) return null;
        throw new UserNotFoundError(mail);
    }
    const dudoc = await getInDomain(domainId, udoc);
    return new User(udoc, dudoc);
}

export function setById(uid: number, $set = {}, $unset = {}) {
    const op: any = {};
    if ($set && Object.keys($set).length) op.$set = $set;
    if ($unset && Object.keys($unset).length) op.$unset = $unset;
    return coll.findOneAndUpdate({ _id: uid }, op);
}

export function setEmail(uid: number, mail: string) {
    return setById(uid, { mail, mailLower: mail.trim().toLowerCase() });
}

export async function changePassword(uid: number, currentPassword: string, newPassword: string) {
    const udoc = await getById('system', uid);
    udoc.checkPassword(currentPassword);
    const salt = String.random();
    return await coll.findOneAndUpdate(
        { _id: udoc._id },
        { $set: { salt, hash: pwhash(newPassword, salt), hashType: 'hydro' } },
    );
}

export async function inc(_id: number, field: string, n = 1) {
    const udoc = await coll.findOne({ _id });
    if (!udoc) throw new UserNotFoundError(_id);
    udoc[field] = udoc[field] + n || n;
    await coll.updateOne({ _id }, { $set: { [field]: udoc[field] } });
    return udoc;
}

export function setInDomain(domainId: string, uid: number, params: any) {
    return document.setStatus(domainId, document.TYPE_DOMAIN_USER, 0, uid, params);
}

export async function incDomain(domainId: string, uid: number, field: string, n = 1) {
    // @ts-ignore
    const dudoc = await getInDomain(domainId, { _id: uid });
    dudoc[field] = dudoc[field] + n || n;
    await setInDomain(domainId, uid, { [field]: dudoc[field] });
    return dudoc;
}

export async function create({
    uid = null, mail, uname, password, regip = '127.0.0.1', priv = PRIV.PRIV_DEFAULT,
}) {
    const salt = String.random();
    if (!uid) uid = await system.inc('user');
    try {
        await coll.insertOne({
            _id: uid,
            mail,
            mailLower: mail.trim().toLowerCase(),
            uname,
            unameLower: uname.trim().toLowerCase(),
            password: pwhash(password, salt),
            salt,
            hashType: 'hydro',
            regat: new Date(),
            regip,
            loginat: new Date(),
            loginip: regip,
            priv,
            gravatar: mail,
        });
    } catch (e) {
        throw new UserAlreadyExistError([uid, uname, mail]);
    }
    return uid;
}

export function getMulti(params) {
    return coll.find(params);
}

export function setMultiInDomain(domainId: string, query: any, params: any) {
    return document.setMultiStatus(domainId, document.TYPE_DOMAIN_USER, query, params);
}

export async function getPrefixList(prefix: string, limit = 50) {
    prefix = prefix.toLowerCase();
    const $regex = new RegExp(`\\A\\Q${prefix}\\E`, 'gmi');
    const udocs = await coll.find({ unameLower: { $regex } }).limit(limit).toArray();
    return udocs;
}

export function setPriv(uid: number, priv: number) {
    return coll.findOneAndUpdate({ _id: uid }, { $set: priv }, { returnOriginal: false });
}

export function setRole(domainId: string, uid: number, role: string) {
    return document.setStatus(domainId, document.TYPE_DOMAIN_USER, 0, uid, { role });
}

export function setRoles(domainId: string, roles: any) {
    const tasks = [];
    for (const role in roles) {
        tasks.push(document.set(
            domainId, document.TYPE_DOMAIN_USER, role, { content: roles[role] },
        ));
    }
    return Promise.all(tasks);
}

export async function getRoles(domainId: string) {
    const docs = await document.getMulti(domainId, document.TYPE_DOMAIN_USER).sort('_id', 1).toArray();
    const roles = [];
    for (const doc of docs) {
        roles.push({ _id: doc.docId, perm: doc.content });
    }
    return roles;
}

export function getRole(domainId: string, name: string) {
    return document.get(domainId, document.TYPE_DOMAIN_USER, name);
}

export function getMultiInDomain(domainId: string, query: any = {}) {
    return document.getMultiStatus(domainId, document.TYPE_DOMAIN_USER, query);
}

export function addRole(domainId: string, name: string, permission: string) {
    return document.add(domainId, permission, 1, document.TYPE_DOMAIN_USER, name);
}

export function deleteRoles(domainId: string, roles) {
    return Promise.all([
        document.deleteMulti(domainId, document.TYPE_DOMAIN_USER, { docId: { $in: roles } }),
        document.deleteMultiStatus(domainId, document.TYPE_DOMAIN_USER, { role: { $in: roles } }),
    ]);
}

export function ban(uid: number) {
    return Promise.all([
        setPriv(uid, PRIV.PRIV_NONE),
        token.delByUid(uid),
    ]);
}

export function ensureIndexes() {
    return Promise.all([
        coll.createIndex('unameLower', { unique: true }),
        coll.createIndex('mailLower', { sparse: true }),
    ]);
}

global.Hydro.model.user = {
    User,
    changePassword,
    create,
    getByEmail,
    getById,
    getByUname,
    getMulti,
    inc,
    incDomain,
    setById,
    setEmail,
    setPassword,
    setInDomain,
    setMultiInDomain,
    getMultiInDomain,
    getPrefixList,
    setPriv,
    setRole,
    setRoles,
    getRole,
    getList,
    getRoles,
    getInDomain,
    addRole,
    deleteRoles,
    ban,
    ensureIndexes,
};
