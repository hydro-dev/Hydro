const builtin = require('./builtin');
const document = require('./document');
const system = require('./system');
const token = require('./token');
const { UserNotFoundError, UserAlreadyExistError } = require('../error');
const perm = require('../permission');
const pwhash = require('../lib/hash.hydro');
const db = require('../service/db');

const coll = db.collection('user');

class USER {
    constructor(udoc, dudoc) {
        this.udoc = () => udoc;
        this.dudoc = () => dudoc;
        this._id = udoc._id;
        this.mail = udoc.mail;
        this.uname = udoc.uname;
        this.salt = () => udoc.salt;
        this.hash = () => udoc.hash;
        this.priv = udoc.priv;
        this.timeZone = udoc.timeZone || 'Asia/Shanghai';
        this.viewLang = udoc.viewLang || 'zh_CN';
        this.codeLang = udoc.codeLang || 'c';
        this.codeTemplate = udoc.codeTemplate || '';
        this.regat = udoc.regat;
        this.loginat = udoc.loginat;
        this.bio = udoc.bio || '';
        this.gravatar = udoc.gravatar || '';
        this.ban = udoc.ban || false;
        this.nAccept = dudoc.nAccept || 0;
        this.nSubmit = dudoc.nSubmit || 0;
        this.rating = dudoc.rating || 1500;
        this.perm = dudoc.perm;
        this.role = dudoc.role || 'default';
    }

    hasPerm(p) {
        return this.perm.includes(p);
    }

    checkPassword(password) {
        const h = global.Hydro.lib[`hash.${this.hashType || 'hydro'}`];
        if (!h) throw new Error('Unknown hash method');
        return h.check(password, this.salt(), this.hash(), this);
    }
}

async function getInDomain(domainId, udoc) {
    let dudoc = await document.getStatus(domainId, document.TYPE_DOMAIN_USER, 0, udoc._id);
    dudoc = dudoc || {};
    if (udoc._id === 1) dudoc.role = 'guest';
    if (udoc.priv === 1) dudoc.role = 'admin';
    const p = await document.get(domainId, document.TYPE_DOMAIN_USER, dudoc.role || 'default');
    dudoc.perm = p ? p.content : builtin.BUILTIN_ROLES[dudoc.role || 'default'].perm;
    return dudoc;
}

async function getById(domainId, _id, throwError = false) {
    const udoc = await coll.findOne({ _id });
    if (!udoc) {
        if (throwError) throw new UserNotFoundError(_id);
        else return null;
    }
    const dudoc = await getInDomain(domainId, udoc);
    return new USER(udoc, dudoc);
}

async function getList(domainId, uids) {
    uids = new Set(uids);
    const r = {};
    // eslint-disable-next-line no-await-in-loop
    for (const uid of uids) r[uid] = await getById(domainId, uid);
    return r;
}

async function getByUname(domainId, uname) {
    const unameLower = uname.trim().toLowerCase();
    const udoc = await coll.findOne({ unameLower });
    if (!udoc) throw new UserNotFoundError(uname);
    const dudoc = await getInDomain(domainId, udoc);
    return new USER(udoc, dudoc);
}

async function getByEmail(domainId, mail, ignoreMissing = false) {
    const mailLower = mail.trim().toLowerCase();
    const udoc = await coll.findOne({ mailLower });
    if (!udoc) {
        if (ignoreMissing) return null;
        throw new UserNotFoundError(mail);
    }
    const dudoc = await getInDomain(domainId, udoc);
    return new USER(udoc, dudoc);
}

function setPassword(uid, password) {
    const salt = String.random();
    return coll.findOneAndUpdate({ _id: uid }, {
        $set: { salt, hash: pwhash.hash(password, salt), hashType: 'hydro' },
    });
}

function setById(uid, args) {
    return coll.findOneAndUpdate({ _id: uid }, { $set: args });
}

function setEmail(uid, mail) {
    return setById(uid, { mail, mailLower: mail.trim().toLowerCase() });
}

async function changePassword(uid, currentPassword, newPassword) {
    const udoc = await getById(uid);
    udoc.checkPassword(currentPassword);
    const salt = String.random();
    return await coll.findOneAndUpdate({ // eslint-disable-line no-return-await
        _id: udoc._id,
    }, {
        $set: { salt, hash: pwhash.hash(newPassword, salt), hashType: 'hydro' },
    });
}

async function inc(_id, field, n = 1) {
    const udoc = await coll.findOne({ _id });
    udoc[field] = udoc[field] + n || n;
    await coll.updateOne({ _id }, { $set: { [field]: udoc[field] } });
    return udoc;
}

function setInDomain(domainId, uid, params) {
    return document.setStatus(domainId, document.TYPE_DOMAIN_USER, 0, uid, params);
}

async function incDomain(domainId, uid, field, n = 1) {
    const dudoc = await getInDomain(domainId, { _id: uid });
    dudoc[field] = dudoc[field] + n || n;
    await setInDomain(domainId, uid, { [field]: dudoc[field] });
    return dudoc;
}

async function create({
    uid, mail, uname, password, regip = '127.0.0.1', priv = perm.PRIV_NONE,
}) {
    const salt = String.random();
    if (!uid) uid = system.inc('user');
    try {
        await coll.insertOne({
            _id: uid,
            mail,
            mailLower: mail.trim().toLowerCase(),
            uname,
            unameLower: uname.trim().toLowerCase(),
            password: pwhash.hash(password, salt),
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
}

function getMulti(params) {
    return coll.find(params);
}

function setMultiInDomain(domainId, query, params) {
    return document.setMultiStatus(domainId, document.TYPE_DOMAIN_USER, query, params);
}

async function getPrefixList(prefix, limit = 50) {
    prefix = prefix.toLowerCase();
    const $regex = new RegExp(`\\A\\Q${prefix.replace(/\\E/gmi, /\\E\\E\\Q/gmi)}\\E`, 'gmi');
    const udocs = await coll.find({ unameLower: { $regex } }).limit(limit).toArray();
    return udocs;
}

function setRole(domainId, uid, role) {
    return document.setStatus(domainId, document.TYPE_DOMAIN_USER, 0, uid, { role });
}

function setRoles(domainId, roles) {
    const tasks = [];
    for (const role in roles) {
        tasks.push(document.set(
            domainId, document.TYPE_DOMAIN_USER, role, { content: roles[role] },
        ));
    }
    return Promise.all(tasks);
}

async function getRoles(domainId) {
    const docs = await document.getMulti(domainId, document.TYPE_DOMAIN_USER).sort('_id', 1).toArray();
    const roles = [];
    for (const doc of docs) {
        roles.push({ _id: doc.docId, perm: doc.content });
    }
    return roles;
}

function getRole(domainId, name) {
    return document.get(domainId, document.TYPE_DOMAIN_USER, name);
}

function getMultiInDomain(domainId, query) {
    return document.getMultiStatus(domainId, document.TYPE_DOMAIN_USER, query);
}

function addRole(domainId, name, permission) {
    return document.add(domainId, permission, 1, document.TYPE_DOMAIN_USER, name);
}

function deleteRoles(domainId, roles) {
    return Promise.all([
        document.deleteMulti(domainId, document.TYPE_DOMAIN_USER, { docId: { $in: roles } }),
        document.deleteMultiStatus(domainId, document.TYPE_DOMAIN_USER, { role: { $in: roles } }),
    ]);
}

function ban(uid) {
    return Promise.all([
        coll.updateOne({ _id: uid }, { $set: { ban: true } }),
        token.deleteByUid(uid),
    ]);
}

function setSuperAdmin(uid) {
    return setById(uid, { priv: 1 });
}

function ensureIndexes() {
    return Promise.all([
        coll.createIndex('unameLower', { unique: true }),
        coll.createIndex('mailLower', { sparse: true }),
    ]);
}

global.Hydro.model.user = module.exports = {
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
    setRole,
    setRoles,
    getRole,
    getList,
    getRoles,
    getInDomain,
    addRole,
    deleteRoles,
    setSuperAdmin,
    ban,
    ensureIndexes,
};
