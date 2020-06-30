const description = 'Create a new user';

const user = require('../model/user');
const system = require('../model/system');

async function run({
    uname, password, mail, uid,
}) {
    if (!uid) uid = await system.inc('user');
    else uid = parseInt(uid, 10);
    if (Number.isNaN(uid)) throw new Error('uid');
    await user.create({
        uid, uname, password, mail, regip: '127.0.0.1',
    });
    return uid;
}

global.Hydro.script.register = module.exports = { run, description };
