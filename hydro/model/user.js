const system = require('./system');
const { UserNotFoundError, UserAlreadyExistError } = require('../error');
const pwhash = require('../lib/pwhash');
const validator = require('../lib/validator');
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
        this.lang = user.language || 'zh_CN';
        this.codeLang = user.codeLang || 'c';
        this.codeTemplate = user.codeTemplate || '';
        this.regat = user.regat;
        this.loginat = user.loginat;
        this.bio = user.bio || '';
        this.nAccept = user.nAccept || 0;
        this.nSubmit = user.nSubmit || 0;
    }

    hasPerm(perm) {
        return this.perm === '-' || (this.perm || '').includes(perm);
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
    validator.checkPassword(password);
    const salt = pwhash.salt();
    return coll.findOneAndUpdate({ _id: uid }, {
        $set: { salt, hash: pwhash.hash(password, salt) },
    });
}
function setById(uid, args) {
    coll.findOneAndUpdate({ _id: uid }, { $set: args });
}
function setEmail(uid, mail) {
    validator.checkEmail(mail);
    return setById(uid, { mail, mailLower: mail.trim().toLowerCase() });
}
async function changePassword(uid, currentPassword, newPassword) {
    validator.checkPassword(newPassword);
    const udoc = await getById(uid);
    udoc.checkPassword(currentPassword);
    const salt = pwhash.salt();
    return await coll.findOneAndUpdate({ // eslint-disable-line no-return-await
        _id: udoc._id,
    }, {
        $set: { salt, hash: pwhash.hash(newPassword, salt) },
    });
}
async function inc(_id, field, n) {
    await coll.findOneAndUpdate({ _id }, { $inc: { [field]: n } });
    const udoc = await getById(_id);
    return udoc;
}
async function create({
    uid, mail, uname, password, regip = '127.0.0.1', role = 'default',
}) {
    validator.checkUname(uname);
    validator.checkPassword(password);
    validator.checkEmail(mail);
    const salt = pwhash.salt();
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
            regat: new Date(),
            regip,
            loginat: new Date(),
            loginip: regip,
            role,
            gravatar: mail,
        });
    } catch (e) {
        throw new UserAlreadyExistError([uid, uname, mail]);
    }
}

function getMany(params) {
    return coll.find(params);
}

function getRoles() {
    return collRole.find().toArray();
}

module.exports = {
    changePassword,
    create,
    getByEmail,
    getById,
    getByUname,
    getMany,
    inc,
    setById,
    setEmail,
    setPassword,
    getList,
    getRoles,
};
