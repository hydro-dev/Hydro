const system = require('./system');
const { UserNotFoundError, UserAlreadyExistError } = require('../error');
const perm = require('../permission');
const pwhash = require('../lib/pwhash');
const db = require('../service/db');

const coll = db.collection('user');
const collRole = db.collection('role');

class USER {
    constructor(user) {
        this._id = user._id;
        this.mail = user.mail;
        this.uname = user.uname;
        this.salt = user.salt;
        this.hash = user.hash;
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
        return pwhash.check(password, this.salt, this.hash);
    }
}

async function getById(_id) {
    const udoc = await coll.findOne({ _id });
    if (!udoc) throw new UserNotFoundError(_id);
    const role = await collRole.findOne({ _id: udoc.role || 'default' });
    udoc.perm = role.perm;
    return new USER(udoc);
}

async function getList(uids) {
    const r = {};
    for (const uid of uids) r[uid] = await getById(uid); // eslint-disable-line no-await-in-loop
    return r;
}

async function getByUname(uname) {
    const unameLower = uname.trim().toLowerCase();
    const udoc = await coll.findOne({ unameLower });
    if (!udoc) throw new UserNotFoundError(uname);
    const role = await collRole.findOne({ _id: udoc.role || 'default' });
    udoc.perm = role.perm;
    return new USER(udoc);
}

async function getByEmail(mail, ignoreMissing = false) {
    const mailLower = mail.trim().toLowerCase();
    const udoc = await coll.findOne({ mailLower });
    if (!udoc) {
        if (ignoreMissing) return null;
        throw new UserNotFoundError(mail);
    }
    const role = await collRole.findOne({ _id: udoc.role || 'default' });
    udoc.perm = role.perm;
    return new USER(udoc);
}

function setPassword(uid, password) {
    const salt = pwhash.salt();
    return coll.findOneAndUpdate({ _id: uid }, {
        $set: { salt, hash: pwhash.hash(password, salt) },
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
    const salt = pwhash.salt();
    return await coll.findOneAndUpdate({ // eslint-disable-line no-return-await
        _id: udoc._id,
    }, {
        $set: { salt, hash: pwhash.hash(newPassword, salt) },
    });
}

async function inc(_id, field, n = 1) {
    const udoc = await coll.findOne({ _id });
    udoc[field] = udoc[field] + n || n;
    await coll.updateOne({ _id }, { $set: { [field]: udoc[field] } });
    return udoc;
}

async function create({
    uid, mail, uname, password, regip = '127.0.0.1', role = 'default',
}) {
    const salt = pwhash.salt();
    if (!uid) uid = system.inc('user');
    try {
        await Promise.all([
            coll.insertOne({
                _id: uid,
                mail,
                mailLower: mail.trim().toLowerCase(),
                uname,
                unameLower: uname.trim().toLowerCase(),
                password: pwhash.hash(password, salt),
                salt,
                regat: new Date(),
                regip,
                loginat: new Date(),
                loginip: regip,
                role,
                gravatar: mail,
            }),
            collRole.updateOne({ _id: role }, { $inc: { count: 1 } }),
        ]);
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

async function setRole(uid, role) {
    const udoc = await getById(uid);
    return await Promise.all([ // eslint-disable-line no-return-await
        coll.findOneAndUpdate({ _id: uid }, { $set: { role } }),
        collRole.updateOne({ _id: udoc.role }, { $inc: { count: -1 } }),
        collRole.updateOne({ _id: role }, { $inc: { count: 1 } }),
    ]);
}

function getRoles() {
    return collRole.find().sort('_id', 1).toArray();
}

function getRole(name) {
    return collRole.findOne({ _id: name });
}

function addRole(name, permission) {
    return collRole.insertOne({ _id: name, perm: permission, count: 0 });
}

function deleteRoles(roles) {
    return Promise.all([
        coll.updateMany({ role: { $in: roles } }, { $set: { role: 'default' } }),
        collRole.deleteMany({ _id: { $in: roles } }),
    ]);
}

function index() {
    return Promise.all([
        collRole.updateOne({ _id: 'root' }, { $set: { perm: perm.PERM_ALL } }),
        coll.createIndex('unameLower', { unique: true }),
        coll.createIndex('mailLower', { sparse: true }),
    ]);
}

module.exports = {
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
    index,
};
