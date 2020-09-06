import mongodb from 'mongodb';
import * as bus from './bus';
import options from '../options';

const opts = options();

let mongourl = 'mongodb://';
if (opts.username) mongourl += `${opts.username}:${opts.password}@`;
mongourl += `${opts.host}:${opts.port}/${opts.name}`;

// eslint-disable-next-line import/no-mutable-exports
export let db: mongodb.Db = null;
// eslint-disable-next-line import/no-mutable-exports
export let db2: mongodb.Db = null;

mongodb.MongoClient.connect(mongourl, { useNewUrlParser: true, useUnifiedTopology: true })
    .then((Client) => {
        db = Client.db(opts.name);
        global.Hydro.service.db.db = db;
        mongodb.MongoClient.connect(mongourl, { useNewUrlParser: true, useUnifiedTopology: true })
            .then((Client1) => {
                db2 = Client1.db(opts.name);
                global.Hydro.service.db.db2 = db2;
                bus.parallel('database/connect', db);
            });
    });

export function collection(c: string) {
    if (opts.prefix) return db.collection(`${opts.prefix}.${c}`);
    return db.collection(c);
}

global.Hydro.service.db = { collection, db, db2 };
