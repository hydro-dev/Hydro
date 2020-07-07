import mongodb from 'mongodb';
import * as bus from './bus';
import options from '../options';

let mongourl = 'mongodb://';
if (options.username) mongourl += `${options.username}:${options.password}@`;
mongourl += `${options.host}:${options.port}/${options.name}`;

export let db: mongodb.Db = null;

mongodb.MongoClient.connect(mongourl, { useNewUrlParser: true, useUnifiedTopology: true })
    .then((Client) => {
        db = Client.db(options.name);
        bus.publish('system_database_connected', null);
    });

export function collection(c: string) {
    return db.collection(c);
}

global.Hydro.service.db = { collection };

export default { collection };
