/* eslint-disable import/no-mutable-exports */
import { EventEmitter } from 'events';
import mongodb, { Db, MongoClient } from 'mongodb';

export let db: Db = null;
export let client: MongoClient = null;
export let db2: Db = null;
export let client2: MongoClient = null;

export const bus = new EventEmitter();

mongodb.MongoClient.connect(
    // @ts-ignore
    global.__MONGO_URI__,
    { useNewUrlParser: true, useUnifiedTopology: true },
).then((c) => {
    // @ts-ignore
    db = c.db(global.__MONGO_DB_NAME__);
    client = c;
    mongodb.MongoClient.connect(
        // @ts-ignore
        global.__MONGO_URI__,
        { useNewUrlParser: true, useUnifiedTopology: true },
    ).then((c2) => {
        // @ts-ignore
        db2 = c2.db(global.__MONGO_DB_NAME__);
        client2 = c2;
        bus.emit('connect');
    });
});

export function collection(c: string) {
    return db.collection(c);
}

export function getClient() {
    return client;
}

export function getClient2() {
    return client2;
}

export function getDb() {
    return db;
}

export function getDb2() {
    return db2;
}
