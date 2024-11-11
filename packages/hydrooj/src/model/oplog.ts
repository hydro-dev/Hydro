import { cloneDeep } from 'lodash';
import { ObjectId } from 'mongodb';
import { OplogDoc } from '../interface';
import * as bus from '../service/bus';
import db from '../service/db';
import type { Handler } from '../service/server';

export const coll = db.collection('oplog');

export async function add(data: Partial<OplogDoc> & { type: string }): Promise<ObjectId> {
    const _data = { ...data };
    if (_data._id) {
        _data.id = _data._id;
        delete _data._id;
    }
    const res = await coll.insertOne({ _id: new ObjectId(), ..._data });
    return res.insertedId;
}

function safeKeys(data: any) {
    if (['string', 'number', 'boolean'].includes(typeof data)) return data;
    if (data instanceof Array) for (const d of data) safeKeys(d);
    else if (data instanceof ObjectId) return data;
    else if (data instanceof Object) {
        for (const key in data) {
            if (['password', 'verifyPassword'].includes(key) || key.startsWith('__')) {
                delete data[key];
                continue;
            }
            safeKeys(data[key]);
            if (key.includes('$') || key.includes('.')) {
                data[key.replace(/[$.]/g, '_')] = data[key];
                delete data[key];
            }
        }
    }
    return data;
}

export async function log<T extends Handler>(handler: T, type: string, data: any) {
    const args = safeKeys(cloneDeep(handler.args));
    await bus.parallel('oplog/log', type, handler, args, data);
    const res = await coll.insertOne({
        ...data,
        _id: new ObjectId(),
        type,
        time: new Date(),
        domainId: handler.args.domainId,
        ua: handler.request.headers?.['user-agent'],
        referer: handler.request.headers?.referer,
        path: handler.request.path,
        args,
        operator: handler.user?._id,
        operateIp: handler.request.ip,
    });
    return res.insertedId;
}

export async function get(id: ObjectId) {
    return await coll.findOne({ _id: id });
}

global.Hydro.model.oplog = {
    coll, add, get, log,
};
