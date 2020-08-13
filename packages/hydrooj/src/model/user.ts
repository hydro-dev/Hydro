import { Collection } from 'mongodb';
import * as system from './system';
import * as token from './token';
import * as setting from './setting';
import * as domain from './domain';
import { BUILTIN_USERS, PRIV } from './builtin';
import { UserNotFoundError, UserAlreadyExistError, LoginError } from '../error';
import pwhash from '../lib/hash.hydro';
import * as db from '../service/db';
import { User as _User, Udoc, Udict } from '../interface';

const coll: Collection<Udoc> = db.collection('user');

export async function setPassword(uid: number, password: string): Promise<Udoc> {
    const salt = String.random();
    const res = await coll.findOneAndUpdate(
        { _id: uid },
        { $set: { salt, hash: pwhash(password, salt), hashType: 'hydro' } },
        { returnOriginal: false },
    );
    return res.value;
}

export class User implements _User {
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

    perm: () => bigint;

    role: string;

    regip: () => string;

    loginip: () => string;

    [key: string]: any;

    constructor(udoc: Udoc, dudoc) {
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
        this.perm = () => dudoc.perm;
        this.role = dudoc.role || 'default';

        for (const key in setting.SETTINGS_BY_KEY) {
            if (udoc[key]) this[key] = udoc[key];
            else if (setting.SETTINGS_BY_KEY[key].value !== null) {
                this[key] = setting.SETTINGS_BY_KEY[key].value;
            }
        }

        for (const key in setting.DOMAIN_USER_SETTINGS_BY_KEY) {
            if (dudoc[key]) this[key] = dudoc[key];
            else if (setting.DOMAIN_USER_SETTINGS_BY_KEY[key].value !== null) {
                this[key] = setting.DOMAIN_USER_SETTINGS_BY_KEY[key].value;
            }
        }
    }

    hasPerm(...perm: bigint[]) {
        for (const i in perm) {
            if ((this.perm() & perm[i]) === perm[i]) return true;
        }
        return false;
    }

    hasPriv(...priv: number[]) {
        for (const i in priv) {
            if ((this.priv & priv[i]) === priv[i]) return true;
        }
        return false;
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

export async function getById(domainId: string, _id: number): Promise<User | null> {
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

export async function getByUname(domainId: string, uname: string): Promise<User | null> {
    const unameLower = uname.trim().toLowerCase();
    const udoc = (unameLower === 'guest')
        ? BUILTIN_USERS[0]
        : unameLower === 'hydro'
            ? BUILTIN_USERS[1]
            : await coll.findOne({ unameLower });
    if (!udoc) return null;
    const dudoc = await domain.getDomainUser(domainId, udoc);
    return new User(udoc, dudoc);
}

export async function getByEmail(domainId: string, mail: string): Promise<User | null> {
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

export async function inc(_id: number, field: string, n = 1) {
    const udoc = await coll.findOne({ _id });
    if (!udoc) throw new UserNotFoundError(_id);
    udoc[field] = udoc[field] + n || n;
    await coll.updateOne({ _id }, { $set: { [field]: udoc[field] } });
    return udoc;
}

export async function create(
    mail: string, uname: string, password: string,
    uid?: number, regip = '127.0.0.1', priv = PRIV.PRIV_DEFAULT,
) {
    const salt = String.random();
    if (!uid) uid = await system.inc('user');
    try {
        await coll.insertOne({
            _id: uid,
            mail,
            mailLower: mail.trim().toLowerCase(),
            uname,
            unameLower: uname.trim().toLowerCase(),
            hash: pwhash(password.toString(), salt),
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
        console.log(e);
        throw new UserAlreadyExistError([uid, uname, mail]);
    }
    return uid;
}

export function getMulti(params: any) {
    return coll.find(params);
}

export async function getPrefixList(domainId: string, prefix: string, limit = 50) {
    prefix = prefix.toLowerCase();
    const $regex = new RegExp(`\\A\\Q${prefix}\\E`, 'gmi');
    const uids = await coll.find({ unameLower: { $regex } })
        .limit(limit).map((doc) => doc._id).toArray();
    const users = [];
    for (const uid of uids) users.push(getById(domainId, uid));
    return await Promise.all(users);
}

export async function setPriv(uid: number, priv: number): Promise<Udoc | null> {
    const udoc = await coll.findOneAndUpdate(
        { _id: uid },
        { $set: { priv } },
        { returnOriginal: false },
    );
    return udoc.value;
}

export async function setSuperAdmin(uid: number) {
    await setPriv(uid, PRIV.PRIV_ALL);
    return uid;
}

export async function setJudge(uid: number) {
    await setPriv(uid, PRIV.PRIV_JUDGE);
    return uid;
}

export function ban(uid: number) {
    return Promise.all([
        setPriv(uid, PRIV.PRIV_NONE),
        token.delByUid(uid),
    ]);
}

function ensureIndexes() {
    return Promise.all([
        coll.createIndex('unameLower', { unique: true }),
        coll.createIndex('mailLower', { sparse: true }),
    ]);
}

global.Hydro.postInit.push(ensureIndexes);
global.Hydro.model.user = {
    User,
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
    setSuperAdmin,
    setJudge,
    ban,
};
