import { FilterQuery, ObjectID } from 'mongodb';
import user from './user';
import { MessageDoc } from '../interface';
import { ArgMethod } from '../utils';
import db from '../service/db';
import * as bus from '../service/bus';

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
        return result.value;
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

function ensureIndexes() {
    return Promise.all([
        coll.createIndex({ to: 1, _id: -1 }),
        coll.createIndex({ from: 1, _id: -1 }),
    ]);
}

bus.once('app/started', ensureIndexes);
export default MessageModel;
global.Hydro.model.message = MessageModel;
