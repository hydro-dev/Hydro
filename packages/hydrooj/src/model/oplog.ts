import { ObjectID } from 'mongodb';
import { OplogDoc } from '../interface';
import db from '../service/db';

export const coll = db.collection('oplog');

export async function add(data: Partial<OplogDoc> & { type: string }): Promise<ObjectID> {
    const res = await coll.insertOne({ _id: new ObjectID(), ...data });
    return res.insertedId;
}

export async function get(id: ObjectID): Promise<OplogDoc | null> {
    return await coll.findOne({ _id: id });
}

global.Hydro.model.oplog = { coll, add, get };
