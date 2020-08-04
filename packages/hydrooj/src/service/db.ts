import mongodb from 'mongodb';
import MongoWatcher from 'mongodb-watcher';
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
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const watcher = new MongoWatcher(db, {
            longCursorThreshold: 100,
            largeInsertThreshold: 1024 * 30,
            largeFetchThreshold: 1024 * 30,
        });
        bus.publish('system_database_connected', null);
    });

export function collection(c: string) {
    return db.collection(c);
}

global.Hydro.service.db = { collection, db };
