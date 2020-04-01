const
    { UserNotFoundError, UserAlreadyExistError, DomainNotFoundError,
        UserAlreadyDomainMemberError } = require('../error'),
    system = require('./system'),
    domain = require('./domain'),
    { pwhash, validator } = require('../utils'),
    db = require('../service/db.js'),
    coll = db.collection('user'),
    coll_domain = db.collection('domain_user');

class USER {
    constructor(user, domainUser = {}) {
        if (!user) throw new UserNotFoundError();
        this._id = user._id;
        this.email = user.email;
        this.uname = user.uname;
        this.priv = user.priv;
        this.salt = user.salt;
        this.hash = user.hash;
        this.perm = domainUser.perm || '0';
        this.displayName = domainUser.displayName || null;
        this.domainId = domainUser.domainId || 'system';
    }
    hasPriv(priv) {
        return this.priv & priv;
    }
    hasPerm(perm) {
        console.log('PERM', perm, this.perm);
        return this.perm == '-' || (this.perm || '').includes(perm);
    }
    checkPassword(password) {
        return pwhash.check(password, this.salt, this.hash);
    }
    /**
     * @param {string} role
     * @param {date} joinAt
     */
    async joinDomain(role, joinAt) {
        validator.checkRole(role);
        try {
            await coll_domain.updateOne(
                { domainId: this.domainId, uid: this._id, role: { $exists: false } },
                { $set: { role, joinAt: joinAt || new Date() } },
                { upsert: true }
            );
        } catch (e) {
            throw new UserAlreadyDomainMemberError(this.domainId, this._id);
        }
        return true;
    }
}
async function getById(_id, domainId) {
    let dudoc, udoc = await coll.findOne({ _id });
    if (domainId) {
        let ddoc = await domain.get(domainId);
        if (!ddoc) throw new DomainNotFoundError(domainId);
        dudoc = (await coll_domain.findOne({ uid: _id, domainId })) || {};
        console.log(dudoc.role, ddoc.roles, { uid: _id, domainId });
        dudoc.perm = ddoc.roles[dudoc.role || 'default'];
    }
    return new USER(udoc, dudoc);
}
async function getByUname(uname) {
    let unameLower = uname.trim().toLowerCase();
    let udoc = await coll.findOne({ unameLower });
    return new USER(udoc);
}
async function getByEmail(email) {
    let emailLower = email.trim().toLowerCase();
    let udoc = await coll.findOne({ emailLower });
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

function setPriv(uid, priv) {
    setById(uid, { priv });
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
    setPassword, setPriv
};