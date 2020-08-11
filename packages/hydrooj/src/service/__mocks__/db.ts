/* eslint-disable import/no-mutable-exports */
import { EventEmitter } from 'events';
import mongodb, { Db, MongoClient } from 'mongodb';

export let db: Db = null;
export let client: MongoClient = null;

export const bus = new EventEmitter();

mongodb.MongoClient.connect(
    // @ts-ignore
    global.__MONGO_URI__,
    { useNewUrlParser: true, useUnifiedTopology: true },
).then((c) => {
    // @ts-ignore
    db = c.db(global.__MONGO_DB_NAME__);
    client = c;
    bus.emit('connect');
});

export function collection(c: string) {
    return db.collection(c);
}

export function getClient() {
    return client;
}

export function getDb() {
    return db;
}
