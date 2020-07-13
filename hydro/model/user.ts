import * as system from './system';
import * as token from './token';
import * as setting from './setting';
import * as domain from './domain';
import { BUILTIN_USERS, PRIV } from './builtin';
import { UserNotFoundError, UserAlreadyExistError, LoginError } from '../error';
import pwhash from '../lib/hash.hydro';
import * as db from '../service/db';
import { Udoc, Udict } from '../interface';

const coll = db.collection('user');

export function setPassword(uid: number, password: string) {
    const salt = String.random();
    return coll.findOneAndUpdate(
        { _id: uid },
        { $set: { salt, hash: pwhash(password, salt), hashType: 'hydro' } },
    );
}

export class User implements Udoc {
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
        return !!(this.priv & p);
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

export async function getById(domainId: string, _id: number): Promise<Udoc | null> {
    const udoc = _id === 0 || _id === 1
        ? BUILTIN_USERS[_id]
        : await coll.findOne({ _id });
    if (!udoc) return null;
    const dudoc = await domain.getDomainUser(domainId, udoc);
    return new User(udoc, dudoc);
}

export async function getList(domainId: string, uids: number[]): Promise<Udict> {
    const _uids = new Set(uids);
    const r = {};
    // eslint-disable-next-line no-await-in-loop
    for (const uid of _uids) r[uid] = await getById(domainId, uid);
    return r;
}

export async function getByUname(
    domainId: string, uname: string, ignoreMissing = false,
): Promise<Udoc> {
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
    const dudoc = await domain.getDomainUser(domainId, udoc);
    return new User(udoc, dudoc);
}

export async function getByEmail(domainId: string, mail: string): Promise<Udoc | null> {
    const mailLower = mail.trim().toLowerCase();
    const udoc = (mailLower === 'guest@hydro.local')
        ? BUILTIN_USERS[0]
        : mailLower === 'hydro@hydro.local'
            ? BUILTIN_USERS[1]
            : await coll.findOne({ mailLower });
    if (!udoc) return null;
    const dudoc = await domain.getDomainUser(domainId, udoc);
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
    if (!udoc) throw new UserNotFoundError(uid);
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

export async function getPrefixList(prefix: string, limit = 50) {
    prefix = prefix.toLowerCase();
    const $regex = new RegExp(`\\A\\Q${prefix}\\E`, 'gmi');
    const udocs = await coll.find({ unameLower: { $regex } }).limit(limit).toArray();
    return udocs;
}

export function setPriv(uid: number, priv: number) {
    return coll.findOneAndUpdate({ _id: uid }, { $set: priv }, { returnOriginal: false });
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
    setById,
    setEmail,
    setPassword,
    getPrefixList,
    setPriv,
    getList,
    ban,
    ensureIndexes,
};
