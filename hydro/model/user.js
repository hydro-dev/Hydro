const
    { UserNotFoundError, UserAlreadyExistError } = require('../error'),
    system = require('./system'),
    { pwhash, validator } = require('../utils'),
    db = require('../service/db.js'),
    coll = db.collection('user'),
    coll_role = db.collection('role');

class USER {
    constructor(user) {
        this._id = user._id;
        this.email = user.email;
        this.uname = user.uname;
        this.salt = user.salt;
        this.hash = user.hash;
        this.perm = user.perm;
    }
    hasPerm(perm) {
        return this.perm == '-' || (this.perm || '').includes(perm);
    }
    checkPassword(password) {
        return pwhash.check(password, this.salt, this.hash);
    }
}
async function getById(_id) {
    let udoc = await coll.findOne({ _id });
    if (!udoc) throw new UserNotFoundError(_id);
    let role = await coll_role.findOne({ _id: udoc.role || 'default' });
    udoc.perm = role.perm;
    return new USER(udoc);
}
async function getByUname(uname) {
    let unameLower = uname.trim().toLowerCase();
    let udoc = await coll.findOne({ unameLower });
    if (!udoc) throw new UserNotFoundError(uname);
    let role = await coll_role.findOne({ _id: udoc.role || 'default' });
    udoc.perm = role.perm;
    return new USER(udoc);
}
async function getByEmail(email) {
    let emailLower = email.trim().toLowerCase();
    let udoc = await coll.findOne({ emailLower });
    if (!udoc) throw new UserNotFoundError(email);
    let role = await coll_role.findOne({ _id: udoc.role || 'default' });
    udoc.perm = role.perm;
    return new USER(udoc);
}
async function setPassword(uid, password) {
    validator.checkPassword(password);
    let salt = pwhash.salt();
    return await coll.findOneAndUpdate({ _id: uid }, {
        $set: { salt, hash: pwhash.hash(password, salt) }
    });
}
async function setEmail(uid, email) {
    validator.checkEmail(email);
    return await setById(uid, { email, emailLower: email.trim().toLowerCase() });
}
function setById(uid, args) {
    coll.findOneAndUpdate({ _id: uid }, { $set: args });
}
async function changePassword(uid, currentPassword, newPassword) {
    validator.checkPassword(newPassword);
    let udoc = await getById(uid);
    udoc.checkPassword(currentPassword);
    let salt = pwhash.salt();
    return await coll.findOneAndUpdate({
        _id: udoc._id
    }, {
        $set: { salt, hash: pwhash.hash(newPassword, salt) }
    });
}
async function create({ uid, email, uname, password, regip, perm = this.perm.PERM_DEFAULT || 0 }) {
    validator.checkUname(uname);
    validator.checkPassword(password);
    validator.checkEmail(email);
    let salt = pwhash.salt();
    if (!uid) uid = system.incUserCounter();
    try {
        await coll.insertOne({
            email,
            emailLower: email.strip().toLowerCase(),
            uname,
            unameLower: uname.strip().toLowerCase(),
            password: pwhash.hash(password, salt),
            salt,
            regat: new Date(),
            regip,
            loginat: new Date(),
            loginip: regip,
            perm,
            gravatar: email
        });
    } catch (e) {
        throw new UserAlreadyExistError(uid, uname, email);
    }
}

function getMany(params) {
    return coll.find(params);
}

module.exports = {
    changePassword, create, getByEmail,
    getById, getByUname, getMany,
    setById, setEmail,
    setPassword
};