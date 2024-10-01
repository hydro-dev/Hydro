/* eslint-disable no-await-in-loop */
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { MongoClient, WriteConcern } from 'mongodb';
import mongoUri from 'mongodb-uri';
import { readline } from '../ui';

export async function load() {
    console.error('Config file not found.');
    if (!process.stdin.isTTY) {
        console.error('Please fill in ~/.hydro/config.json with MongoDB connection string in the following format:');
        console.error('{"url":"mongodb://localhost:27017/hydro"}');
        process.exit(1);
    }
    // eslint-disable-next-line no-constant-condition
    while (true) {
        console.error('Please type your MongoDB connection string below:');
        console.error('Example: mongodb://localhost:27017/hydro');
        try {
            const uri = await readline();
            if (!uri) throw new Error('no url found');
            const url = mongoUri.parse(uri);
            const Database = await MongoClient.connect(uri, {
                readPreference: 'nearest',
                writeConcern: new WriteConcern('majority'),
            });
            const db = Database.db(url.database);
            const coll = db.collection<any>('system');
            await coll.updateOne({ _id: '_test' }, { $set: { value: 1 } }, { upsert: true });
            await coll.deleteOne({ _id: '_test' });
            fs.ensureDirSync(path.resolve(os.homedir(), '.hydro'));
            fs.writeFileSync(path.resolve(os.homedir(), '.hydro', 'config.json'), JSON.stringify({ url: uri }));
            break;
        } catch (e) {
            console.error(e);
        }
    }
}
