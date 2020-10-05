import { ObjectID } from 'mongodb';
import { OplogDoc } from '../interface';
import * as db from '../service/db';

export const coll = db.collection('oplog');

export async function add(data: Partial<OplogDoc>): Promise<ObjectID> {
    const res = await coll.insertOne(data);
    return res.insertedId;
}

export async function get(id: ObjectID): Promise<OplogDoc | null> {
    return await coll.findOne({ _id: id });
}

global.Hydro.model.oplog = { coll, add, get };
