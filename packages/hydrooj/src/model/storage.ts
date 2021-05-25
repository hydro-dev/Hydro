import { escapeRegExp } from 'lodash';
import { ItemBucketMetadata } from 'minio';
import moment from 'moment';
import type { Readable } from 'stream';
import TaskModel from './task';
import storage from '../service/storage';
import * as bus from '../service/bus';
import db from '../service/db';

export class StorageModel {
    static coll = db.collection('storage');

    static async put(path: string, file: string | Buffer | Readable, meta: ItemBucketMetadata = {}) {
        const [current, place] = await Promise.all([
            StorageModel.coll.findOne({ path }),
            StorageModel.coll.findOne({ _id: path }),
        ]);
        if (current) {
            await storage.put(current._id, file, meta);
            const { metaData, size, etag } = await storage.getMeta(current._id);
            await StorageModel.coll.updateOne({ path }, {
                $set: {
                    meta: metaData, size, etag, lastModified: new Date(), autoDelete: null,
                },
            });
            return path;
        }
        const target = place ? path + Math.random().toString(16) : path;
        await storage.put(target, file, meta);
        const { metaData, size, etag } = await storage.getMeta(target);
        await StorageModel.coll.insertOne({
            _id: target, meta: metaData, path, size, etag, lastModified: new Date(),
        });
        return path;
    }

    static async get(path: string, savePath?: string) {
        const { value } = await StorageModel.coll.findOneAndUpdate({ path }, { $set: { lastUsage: new Date() } }, { returnOriginal: false });
        if (value) return await storage.get(value._id, savePath);
        return await storage.get(path, savePath);
    }

    static async rename(path: string, newPath: string) {
        return await StorageModel.coll.updateOne({ path }, { $set: { path: newPath } });
    }

    static async del(path: string[]) {
        const autoDelete = moment().add(7, 'day').toDate();
        await StorageModel.coll.updateMany({ path: { $in: path } }, { $set: { autoDelete } });
    }

    static async list(target: string, recursive = true) {
        if (target.includes('..') || target.includes('//')) throw new Error('Invalid path');
        if (target.length && !target.endsWith('/')) target += '/';
        const results = recursive
            ? await StorageModel.coll.find({ path: { $regex: new RegExp(`^${escapeRegExp(target)}`, 'i') } }).toArray()
            : await StorageModel.coll.find({ path: { $regex: new RegExp(`^${escapeRegExp(target)}[^/]+$`) } }).toArray();
        return results.map((i) => ({
            ...i, name: i.path, prefix: i.path.split(target)[1],
        }));
    }

    static async getMeta(path: string) {
        const { value } = await StorageModel.coll.findOneAndUpdate({ path }, { $set: { lastUsage: new Date() } }, { returnOriginal: false });
        if (!value) return null;
        return {
            ...value.meta,
            size: value.size,
            lastModified: value.lastModified,
            etag: value.etag,
        };
    }

    static async signDownloadLink(target: string, filename?: string, noExpire = false, useAlternativeEndpointFor?: 'user' | 'judge') {
        await StorageModel.coll.updateOne({ path: target }, { $set: { lastUsage: new Date() } });
        return await storage.signDownloadLink(target, filename, noExpire, useAlternativeEndpointFor);
    }
}

async function cleanFiles() {
    let res = await StorageModel.coll.findOneAndDelete({ autoDelete: { $lte: new Date() } });
    while (res.value) {
        // eslint-disable-next-line no-await-in-loop
        await storage.del(res.value._id);
        // eslint-disable-next-line no-await-in-loop
        res = await StorageModel.coll.findOneAndDelete({ autoDelete: { $lte: new Date() } });
    }
}
TaskModel.Worker.addHandler('storage.prune', cleanFiles);
bus.once('app/started', async () => {
    if (!await TaskModel.count({ type: 'schedule', subType: 'storage.prune' })) {
        await TaskModel.add({
            type: 'schedule',
            subType: 'storage.prune',
            executeAfter: moment().minute(0).second(0).millisecond(0).toDate(),
            interval: [1, 'hour'],
        });
    }
});
bus.on('domain/delete', async (domainId) => {
    const files = await StorageModel.list(`problem/${domainId}`);
    await StorageModel.del(files.map((i) => i.path));
});

global.Hydro.model.storage = StorageModel;
export default StorageModel;
