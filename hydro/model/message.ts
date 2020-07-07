import { ObjectID, QuerySelector } from 'mongodb';
import { MessageNotFoundError } from '../error';
import * as db from '../service/db';

const coll = db.collection('message');

export async function send(from: number, to: number, content: string) {
    const res = await coll.insertOne({
        from, to, content, unread: true,
    });
    return {
        from, to, content, unread: true, _id: res.insertedId,
    };
}

export async function get(_id: ObjectID) {
    const doc = await coll.findOne({ _id });
    if (!doc) throw new MessageNotFoundError(_id);
    return doc;
}

export function getByUser(uid: number) {
    return coll.find({ $or: [{ from: uid }, { to: uid }] }).sort('_id', 1).toArray();
}

export function getMany<T>(query: QuerySelector<T>, sort, page: number, limit: number) {
    return coll.find(query).sort(sort)
        .skip((page - 1) * limit).limit(limit)
        .toArray();
}

export function del(_id: ObjectID) {
    return coll.deleteOne({ _id });
}

export function count<T>(query: QuerySelector<T>) {
    return coll.find(query).count();
}

export function getMulti(uid: number) {
    return coll.find({ $or: [{ from: uid }, { to: uid }] });
}

export function ensureIndexes() {
    return Promise.all([
        coll.createIndex({ to: 1, _id: -1 }),
        coll.createIndex({ from: 1, _id: -1 }),
    ]);
}

global.Hydro.model.message = {
    count,
    get,
    getByUser,
    del,
    getMany,
    getMulti,
    send,
    ensureIndexes,
};
