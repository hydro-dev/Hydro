const description = 'Set a user as superadmin.';

const user = require('../model/user');
const { PRIV_ALL } = require('../model/builtin').PRIV;

async function run({
    uid,
}) {
    uid = parseInt(uid, 10);
    if (Number.isNaN(uid)) throw new Error('uid');
    await user.setPriv(uid, PRIV_ALL);
    return uid;
}

global.Hydro.script.setSuperadmin = module.exports = { run, description };
