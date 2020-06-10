const user = require('../model/user');

async function run({
    uid,
}) {
    uid = parseInt(uid);
    if (Number.isNaN(uid)) throw new Error('uid');
    await user.setSuperAdmin(uid);
    return uid;
}

global.Hydro.script.setSuperadmin = module.exports = { run };
