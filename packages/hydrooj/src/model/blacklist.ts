import moment from 'moment-timezone';
import { Context } from '../context';
import db from '../service/db';
import { ArgMethod } from '../utils';

let coll = db.collection('blacklist');

class BlackListModel {
    @ArgMethod
    static async add(id: string, expire?: Date | number) {
        let expireAt;
        if (expire === 0) expireAt = moment().add(1000, 'months').toDate();
        else if (typeof expire === 'number') expireAt = moment().add(expire, 'months').toDate();
        else if (expire instanceof Date) expireAt = expire;
        else expireAt = new Date(new Date().getTime() + 365 * 24 * 60 * 60 * 1000);
        return await coll.findOneAndUpdate(
            { _id: id },
            { $set: { expireAt } },
            { upsert: true, returnDocument: 'after' },
        );
    }

    @ArgMethod
    static async get(id: string) {
        return await coll.findOne({ _id: id });
    }

    @ArgMethod
    static async del(id: string) {
        return await coll.deleteOne({ _id: id });
    }
}

export async function apply(ctx: Context) {
    coll = ctx.db.collection('blacklist');
    await ctx.db.ensureIndexes(
        coll,
        { key: { expireAt: -1 }, name: 'expire', expireAfterSeconds: 0 },
    );
}
export default BlackListModel;
global.Hydro.model.blacklist = BlackListModel;
