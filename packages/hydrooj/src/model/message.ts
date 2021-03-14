import { FilterQuery, ObjectID } from 'mongodb';
import user from './user';
import { Mdoc } from '../interface';
import db from '../service/db';
import * as bus from '../service/bus';

const coll = db.collection('message');

export const FLAG_UNREAD = 1;
export const FLAG_ALERT = 2;

export async function send(
    from: number, to: number,
    content: string, flag: number = FLAG_UNREAD,
): Promise<Mdoc> {
    const res = await coll.insertOne({
        from, to, content, flag,
    });
    const mdoc = {
        from, to, content, _id: res.insertedId, flag,
    };
    if (from !== to) {
        // ENHANCE domainId?
        const udoc = await user.getById('system', to);
        bus.boardcast('user/message', to, mdoc, udoc);
    }
    return mdoc;
}

export async function get(_id: ObjectID): Promise<Mdoc | null> {
    return await coll.findOne({ _id });
}

export async function getByUser(uid: number): Promise<Mdoc[]> {
    return await coll.find({ $or: [{ from: uid }, { to: uid }] }).sort('_id', 1).toArray();
}

export async function getMany(query: FilterQuery<Mdoc>, sort: any, page: number, limit: number): Promise<Mdoc[]> {
    return await coll.find(query).sort(sort)
        .skip((page - 1) * limit).limit(limit)
        .toArray();
}

export async function setFlag(messageId: ObjectID, flag: number): Promise<Mdoc | null> {
    const result = await coll.findOneAndUpdate(
        { _id: messageId },
        { $bit: { flag: { xor: flag } } },
        { returnOriginal: false },
    );
    return result.value;
}

export async function del(_id: ObjectID) {
    return await coll.deleteOne({ _id });
}

export function count(query: FilterQuery<Mdoc> = {}) {
    return coll.find(query).count();
}

export function getMulti(uid: number) {
    return coll.find({ $or: [{ from: uid }, { to: uid }] });
}

function ensureIndexes() {
    return Promise.all([
        coll.createIndex({ to: 1, _id: -1 }),
        coll.createIndex({ from: 1, _id: -1 }),
    ]);
}

bus.once('app/started', ensureIndexes);
global.Hydro.model.message = {
    FLAG_UNREAD,
    FLAG_ALERT,

    count,
    get,
    getByUser,
    del,
    setFlag,
    getMany,
    getMulti,
    send,
};
