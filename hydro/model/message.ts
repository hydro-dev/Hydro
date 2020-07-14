import { ObjectID } from 'mongodb';
import { Mdoc } from '../interface';
import * as db from '../service/db';

const coll = db.collection('message');

export async function send(from: number, to: number, content: string): Promise<Mdoc> {
    const res = await coll.insertOne({
        from, to, content, unread: true,
    });
    return {
        from, to, content, unread: true, _id: res.insertedId,
    };
}

export async function get(_id: ObjectID): Promise<Mdoc> {
    return await coll.findOne({ _id });
}

export async function getByUser(uid: number): Promise<Mdoc[]> {
    return await coll.find({ $or: [{ from: uid }, { to: uid }] }).sort('_id', 1).toArray();
}

export async function getMany(query: any, sort: any, page: number, limit: number): Promise<Mdoc[]> {
    return await coll.find(query).sort(sort)
        .skip((page - 1) * limit).limit(limit)
        .toArray();
}

export async function del(_id: ObjectID) {
    return await coll.deleteOne({ _id });
}

export function count(query: any) {
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
