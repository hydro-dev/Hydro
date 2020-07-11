import moment from 'moment-timezone';
import { ObjectID } from 'mongodb';
import * as db from '../service/db';

const coll = db.collection('task');

export async function add(task: any) {
    const t = { ...task };
    if (typeof t.executeAfter === 'object') t.executeAfter = t.executeAfter.getTime();
    t.count = t.count || 1;
    t.executeAfter = t.executeAfter || new Date().getTime();
    const res = await coll.insertOne(t);
    return res.insertedId;
}

export function get(_id: ObjectID) {
    return coll.findOne({ _id });
}

export function count(query: any) {
    return coll.find(query).count();
}

export function del(_id: ObjectID) {
    return coll.deleteOne({ _id });
}

export async function getFirst(query: any) {
    const q = { ...query };
    q.executeAfter = q.executeAfter || { $lt: new Date().getTime() };
    const res = await coll.findOneAndDelete(q);
    if (res.value) {
        if (res.value.interval) {
            await coll.insertOne({
                ...res.value, executeAfter: moment().add(...res.value.interval).toDate(),
            });
        }
        return res.value;
    }
    return null;
}

export async function consume(query: any, cb: Function) {
    let isRunning = false;
    const interval = setInterval(async () => {
        if (isRunning) return;
        isRunning = true;
        const res = await getFirst(query);
        if (res) {
            try {
                await cb(res);
            } catch (e) {
                clearInterval(interval);
            }
        }
        isRunning = false;
    }, 100);
}

global.Hydro.model.task = {
    add, get, del, count, getFirst, consume,
};
