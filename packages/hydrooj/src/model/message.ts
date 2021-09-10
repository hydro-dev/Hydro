import { FilterQuery, ObjectID } from 'mongodb';
import { MessageDoc } from '../interface';
import * as bus from '../service/bus';
import db from '../service/db';
import { ArgMethod } from '../utils';
import user from './user';

const coll = db.collection('message');

class MessageModel {
    static FLAG_UNREAD = 1;
    static FLAG_ALERT = 2;

    @ArgMethod
    static async send(
        from: number, to: number,
        content: string, flag: number = MessageModel.FLAG_UNREAD,
    ): Promise<MessageDoc> {
        const res = await coll.insertOne({
            from, to, content, flag,
        });
        const mdoc = {
            from, to, content, _id: res.insertedId, flag,
        };
        if (from !== to) bus.broadcast('user/message', to, mdoc);
        await user.inc(to, 'unreadMsg', 1);
        return mdoc;
    }

    static async get(_id: ObjectID): Promise<MessageDoc | null> {
        return await coll.findOne({ _id });
    }

    @ArgMethod
    static async getByUser(uid: number): Promise<MessageDoc[]> {
        return await coll.find({ $or: [{ from: uid }, { to: uid }] }).sort('_id', 1).toArray();
    }

    static async getMany(query: FilterQuery<MessageDoc>, sort: any, page: number, limit: number): Promise<MessageDoc[]> {
        return await coll.find(query).sort(sort)
            .skip((page - 1) * limit).limit(limit)
            .toArray();
    }

    static async setFlag(messageId: ObjectID, flag: number): Promise<MessageDoc | null> {
        const result = await coll.findOneAndUpdate(
            { _id: messageId },
            { $bit: { flag: { xor: flag } } },
            { returnDocument: 'after' },
        );
        return result.value || null;
    }

    static async del(_id: ObjectID) {
        return await coll.deleteOne({ _id });
    }

    @ArgMethod
    static count(query: FilterQuery<MessageDoc> = {}) {
        return coll.find(query).count();
    }

    static getMulti(uid: number) {
        return coll.find({ $or: [{ from: uid }, { to: uid }] });
    }
}

bus.once('app/started', () => db.ensureIndexes(
    coll,
    { key: { to: 1, _id: -1 }, name: 'to' },
    { key: { from: 1, _id: -1 }, name: 'from' },
));
export default MessageModel;
global.Hydro.model.message = MessageModel;
