import { Collection } from 'mongodb';
import { Udoc } from '../interface';
import * as db from '../service/db';
import * as problem from '../model/problem';
import { setPassword } from '../model/user';

export const description = 'Create A Test Database';

export async function run() {
    const collUser: Collection<Udoc> = db.collection('user');
    const collDocument = db.collection('document');
    await Promise.all([
        collUser.updateOne(
            { _id: -1 },
            {
                priv: -1,
                uname: 'Root',
                unameLower: 'root',
                mail: 'root@hydro.local',
                mailLower: 'root@hydro.local',
                bio: 'Test Root User',
                regat: new Date(),
                loginat: new Date(),
                regip: '127.0.0.1',
                loginip: '127.0.0.1',
            },
        ),
    ]);
    await setPassword(-1, 'rootroot');
}

export const validate = {};

global.Hydro.script.createTestDatabase = { run, description, validate };
