import { ObjectID } from 'mongodb';
import { OplogDoc } from '../interface';
import * as bus from '../service/bus';
import db from '../service/db';
import type { Handler } from '../service/server';

export const coll = db.collection('oplog');

export async function add(data: Partial<OplogDoc> & { type: string }): Promise<ObjectID> {
    const _data = { ...data };
    if (_data._id) {
        _data.id = _data._id;
        delete _data._id;
    }
    const res = await coll.insertOne({ _id: new ObjectID(), ..._data });
    return res.insertedId;
}

export async function log<T extends Handler>(handler: T, type: string, data: any) {
    const args = { ...handler.args };
    delete args.password;
    await bus.serial('oplog/log', type, handler, args, data);
    const res = await coll.insertOne({
        ...data,
        _id: new ObjectID(),
        type,
        time: new Date(),
        domainId: handler.domainId,
        ua: handler.request.headers?.['user-agent'],
        referer: handler.request.headers?.referer,
        args,
        operator: handler.user?._id,
        operateIp: handler.request.ip,
    });
    return res.insertedId;
}

export async function get(id: ObjectID): Promise<OplogDoc | null> {
    return await coll.findOne({ _id: id });
}

global.Hydro.model.oplog = {
    coll, add, get, log,
};
