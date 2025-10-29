import { Filter, ObjectId } from 'mongodb';
import { MessageDoc } from '../interface';
import bus from '../service/bus';
import db from '../service/db';
import { ArgMethod } from '../utils';
import { PRIV } from './builtin';
import system from './system';
import user from './user';

class MessageModel {
    static FLAG_UNREAD = 1;
    static FLAG_ALERT = 2;
    static FLAG_RICHTEXT = 4;
    static FLAG_INFO = 8;
    static FLAG_I18N = 16;

    static coll = db.collection('message');

    @ArgMethod
    static async send(
        from: number, to: number | number[],
        content: string, flag: number = MessageModel.FLAG_UNREAD,
    ) {
        if (!Array.isArray(to)) to = [to];
        const base = { from, content, flag, to };
        if (!to.length) return base;
        await MessageModel.coll.insertOne(base);
        bus.broadcast('user/message', to, base);
        if (flag & MessageModel.FLAG_UNREAD) await user.inc(to, 'unreadMsg', 1);
        return base;
    }

    static async sendInfo(to: number, content: string) {
        const mdoc: MessageDoc = {
            from: 1, to, content, flag: MessageModel.FLAG_INFO | MessageModel.FLAG_I18N,
        };
        bus.broadcast('user/message', [to], mdoc);
    }

    static async get(_id: ObjectId) {
        return await MessageModel.coll.findOne({ _id });
    }

    @ArgMethod
    static async getByUser(uid: number) {
        return await MessageModel.coll.find({ $or: [{ from: uid }, { to: uid }] }).sort('_id', -1).limit(1000).toArray();
    }

    static async getMany(query: Filter<MessageDoc>, sort: any, page: number, limit: number) {
        return await MessageModel.coll.find(query).sort(sort)
            .skip((page - 1) * limit).limit(limit)
            .toArray();
    }

    static async del(_id: ObjectId) {
        return await MessageModel.coll.deleteOne({ _id });
    }

    @ArgMethod
    static count(query: Filter<MessageDoc> = {}) {
        return MessageModel.coll.countDocuments(query);
    }

    static getMulti(uid: number) {
        return MessageModel.coll.find({ $or: [{ from: uid }, { to: uid }] });
    }

    static async sendNotification(message: string, ...args: any[]) {
        const targets = await user.getMulti({ priv: { $bitsAllSet: PRIV.PRIV_VIEW_SYSTEM_NOTIFICATION } })
            .project({ _id: 1, viewLang: 1 }).toArray();
        return Promise.all(targets.map(({ _id, viewLang }) => {
            const msg = app.i18n.translate(message, [viewLang || system.get('server.language')]).format(...args);
            return MessageModel.send(1, _id, msg, MessageModel.FLAG_RICHTEXT);
        }));
    }
}

export async function apply() {
    return db.ensureIndexes(
        MessageModel.coll,
        { key: { to: 1, _id: -1 }, name: 'to' },
        { key: { from: 1, _id: -1 }, name: 'from' },
    );
}
export default MessageModel;
global.Hydro.model.message = MessageModel;
