import mongodb from 'mongodb';
import * as bus from './bus';
import options from '../options';

const opts = options();

let mongourl = 'mongodb://';
if (opts.username) mongourl += `${opts.username}:${opts.password}@`;
mongourl += `${opts.host}:${opts.port}/${opts.name}`;

// eslint-disable-next-line import/no-mutable-exports
export let db: mongodb.Db = null;

mongodb.MongoClient.connect(mongourl, { useNewUrlParser: true, useUnifiedTopology: true })
    .then((Client) => {
        db = Client.db(opts.name);
        global.Hydro.service.db.db = db;
        bus.publish('system_database_connected', null);
    });

export function collection(c: string) {
    if (opts.prefix) return db.collection(`${opts.prefix}.${c}`);
    return db.collection(c);
}

global.Hydro.service.db = { collection, db };
