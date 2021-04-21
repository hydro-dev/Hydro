import moment from 'moment';
import { ArgMethod } from '../utils';
import db from '../service/db';
import * as bus from '../service/bus';

const coll = db.collection('blacklist');

class BlackListModel {
    @ArgMethod
    static async add(id: string, expire?: Date | number) {
        let expireAt;
        if (expire === 0) expireAt = moment().add(1000, 'years').toDate();
        if (typeof expire === 'number') expireAt = moment().add(expire, 'months').toDate();
        else if (expire instanceof Date) expireAt = expire;
        else expireAt = new Date(new Date().getTime() + 365 * 24 * 60 * 60 * 1000);
        const res = await coll.findOneAndUpdate(
            { _id: id },
            { $set: { expireAt } },
            { upsert: true, returnOriginal: false },
        );
        return res.value;
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

async function ensureIndexes() {
    return await coll.createIndex('expireAt', { expireAfterSeconds: 0 });
}

bus.once('app/started', ensureIndexes);
export default BlackListModel;
global.Hydro.model.blacklist = BlackListModel;
