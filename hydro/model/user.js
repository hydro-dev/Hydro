const document = require('./document');
const system = require('./system');
const { UserNotFoundError, UserAlreadyExistError } = require('../error');
const perm = require('../permission');
const pwhash = require('../lib/hash.hydro');
const db = require('../service/db');

const coll = db.collection('user');

class USER {
    constructor(user) {
        this._id = user._id;
        this.mail = user.mail;
        this.uname = user.uname;
        this.salt = () => user.salt;
        this.hash = () => user.hash;
        this.perm = user.perm;
        this.viewLang = user.language || 'zh_CN';
        this.codeLang = user.codeLang || 'c';
        this.codeTemplate = user.codeTemplate || '';
        this.regat = user.regat;
        this.loginat = user.loginat;
        this.bio = user.bio || '';
        this.gravatar = user.gravatar || '';
        this.nAccept = user.nAccept || 0;
        this.nSubmit = user.nSubmit || 0;
    }

    hasPerm(p) {
        return this.perm.includes(p);
    }

    checkPassword(password) {
        const h = global.Hydro.lib[`hash.${this.hashType || 'hydro'}`];
        if (!h) throw new Error('Unknown hash method');
        return h.check(password, this.salt(), this.hash());
    }
}

async function getPerm(domainId, udoc) {
    if (udoc.priv === 1) {
        const p = await document.get(domainId, document.TYPE_DOMAIN_ROLE, 'admin');
        return p.content;
    }
    const role = await document.getStatus(domainId, document.TYPE_DOMAIN_ROLE, 0, udoc._id);
    const p = await document.get(domainId, document.TYPE_DOMAIN_ROLE, role || 'default');
    return p.content;
}

async function getById(domainId, _id) {
    const udoc = await coll.findOne({ _id });
    if (!udoc) throw new UserNotFoundError(_id);
    udoc.perm = await getPerm(domainId, udoc);
    return new USER(udoc);
}

async function getList(domainId, uids) {
    const r = {};
    // eslint-disable-next-line no-await-in-loop
    for (const uid of uids) r[uid] = await getById(domainId, uid);
    return r;
}

async function getByUname(domainId, uname) {
    const unameLower = uname.trim().toLowerCase();
    const udoc = await coll.findOne({ unameLower });
    if (!udoc) throw new UserNotFoundError(uname);
    udoc.perm = await getPerm(domainId, udoc);
    return new USER(udoc);
}

async function getByEmail(domainId, mail, ignoreMissing = false) {
    const mailLower = mail.trim().toLowerCase();
    const udoc = await coll.findOne({ mailLower });
    if (!udoc) {
        if (ignoreMissing) return null;
        throw new UserNotFoundError(mail);
    }
    udoc.perm = await getPerm(domainId, udoc);
    return new USER(udoc);
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

async function getPrefixList(prefix, limit = 50) {
    prefix = prefix.toLowerCase();
    const $regex = new RegExp(`\\A\\Q${prefix.replace(/\\E/gmi, /\\E\\E\\Q/gmi)}\\E`, 'gmi');
    const udocs = await coll.find({ unameLower: { $regex } }).limit(limit).toArray();
    return udocs;
}

function setRole(domainId, uid, role) {
    return document.setStatus(domainId, document.TYPE_DOMAIN_ROLE, 0, uid, { role });
}

function getRoles(domainId) {
    return document.getMulti(domainId, document.TYPE_DOMAIN_ROLE).sort('_id', 1).toArray();
}

function getRole(domainId, name) {
    return document.get(domainId, document.TYPE_DOMAIN_ROLE, name);
}

function addRole(domainId, name, permission) {
    return document.add(domainId, permission, 1, document.TYPE_DOMAIN_ROLE, name);
}

function deleteRoles(domainId, roles) {
    return Promise.all([
        document.deleteMulti(domainId, document.TYPE_DOMAIN_ROLE, { docId: { $in: roles } }),
        document.deleteMultiStatus(domainId, document.TYPE_DOMAIN_ROLE, { role: { $in: roles } }),
    ]);
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
    setById,
    setEmail,
    setPassword,
    getPrefixList,
    setRole,
    getRole,
    getList,
    getRoles,
    addRole,
    deleteRoles,
    ensureIndexes,
};
