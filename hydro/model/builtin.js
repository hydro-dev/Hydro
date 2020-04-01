const
    perm = require('../permission'),
    priv = require('../privilege');
const BUILTIN_USERS = [
    {
        _id: 0,
        uname: 'Hydro',
        unameLower: 'hydro',
        email: '',
        emailLower: '',
        salt: '',
        hash: '',
        gender: 'other',
        regat: new Date(0),
        regip: '127.0.0.1',
        priv: priv.PRIV_NONE,
        gravatar: '',
        loginat: new Date(),
        loginip: '127.0.0.1'
    },
    {
        _id: 1,
        email: 'guest@hydro',
        emailLower: 'guest@hydro',
        uname: 'Guest',
        unameLower: 'guest',
        hash: '',
        salt: '',
        regat: new Date(),
        regip: '127.0.0.1',
        loginat: new Date(),
        loginip: '127.0.0.1',
        priv: priv.PRIV_DEFAULT,
        gravatar: 'guest@hydro'
    }
];
const BUILTIN_DOMAINS = [{
    _id: 'system',
    owner: 0,
    roles: {
        guest: perm.PERM_BASIC,
        default: perm.PERM_DEFAULT,
        member: perm.PERM_DEFAULT,
        admin: perm.PERM_ADMIN
    },
    gravatar: '',
    name: 'System',
    bulletin: ''
}];
module.exports = {
    BUILTIN_USERS, BUILTIN_DOMAINS
};