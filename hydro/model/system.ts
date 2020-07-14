import { FindOneAndUpdateOption } from 'mongodb';
import { Dictionary } from 'lodash';
import * as db from '../service/db';

const coll = db.collection('system');

export async function get(_id: string) {
    const doc = await coll.findOne({ _id });
    if (doc) return doc.value;
    return null;
}

export async function getMany(keys: string[]): Promise<any[]> {
    const docs = await coll.find({ _id: { $in: keys } }).toArray();
    const dict = {};
    const res = [];
    for (const doc of docs) {
        dict[doc._id] = doc.value;
    }
    for (const key of keys) {
        res.push(dict[key] || null);
    }
    return res;
}

export async function update(_id: string, operation: any, config: FindOneAndUpdateOption) {
    await coll.findOneAndUpdate({ _id }, operation, config);
    return get(_id);
}

export async function set(_id: string, value: any) {
    await coll.findOneAndUpdate({ _id }, { $set: { value } }, { upsert: true });
    return get(_id);
}

export function inc(field: string) {
    return update(field, { $inc: { value: 1 } }, { upsert: true });
}

global.Hydro.model.system = {
    get,
    getMany,
    update,
    inc,
    set,
};
