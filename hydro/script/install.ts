import { PRIV } from '../model/builtin';
import * as user from '../model/user';
import * as domain from '../model/domain';
import pwhash from '../lib/hash.hydro';

export const description = 'Install';

export async function run({ username = '', password = '' } = {}) {
    const ddoc = await domain.get('system');
    if (!ddoc) await domain.add('system', 0, 'Hydro', 'Hydro System');
    if (username && password) {
        const udoc = await user.getById('system', -1);
        if (!udoc) {
            await user.create('root@hydro.local', username, password, -1, '127.0.0.1', PRIV.PRIV_ALL);
        } else {
            const salt = String.random();
            await user.setById(-1, {
                uname: username,
                unameLower: username.trim().toLowerCase(),
                salt,
                hash: pwhash(password, salt),
                hashType: 'hydro',
            });
        }
    }
}

export const validate = {
    $or: [
        { username: 'string', password: 'string' },
        { username: 'undefined', password: 'undefined' },
    ],
};

global.Hydro.script.install = { run, description, validate };
