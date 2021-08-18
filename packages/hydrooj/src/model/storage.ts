import { escapeRegExp } from 'lodash';
import { ItemBucketMetadata } from 'minio';
import { nanoid } from 'nanoid';
import { lookup } from 'mime-types';
import moment from 'moment';
import { extname } from 'path';
import type { Readable } from 'stream';
import TaskModel from './task';
import storage from '../service/storage';
import * as bus from '../service/bus';
import db from '../service/db';

export class StorageModel {
    static coll = db.collection('storage');

    static async put(path: string, file: string | Buffer | Readable, meta: ItemBucketMetadata = {}) {
        await StorageModel.del([path]);
        meta['Content-Type'] = (path.endsWith('.ans') || path.endsWith('.out'))
            ? 'text/plain'
            : lookup(path) || 'application/octet-stream';
        const _id = `${nanoid(3)}/${nanoid()}${extname(path)}`;
        await storage.put(_id, file, meta);
        const { metaData, size, etag } = await storage.getMeta(_id);
        await StorageModel.coll.insertOne({
            _id, meta: metaData, path, size, etag, lastModified: new Date(),
        });
        return path;
    }

    static async get(path: string, savePath?: string) {
        const { value } = await StorageModel.coll.findOneAndUpdate(
            { path, autoDelete: { $exists: false } },
            { $set: { lastUsage: new Date() } },
            { returnDocument: 'after' },
        );
        return await storage.get(value?._id || path, savePath);
    }

    static async rename(path: string, newPath: string) {
        return await StorageModel.coll.updateOne(
            { path, autoDelete: { $exists: false } },
            { $set: { path: newPath } },
        );
    }

    static async del(path: string[]) {
        const autoDelete = moment().add(7, 'day').toDate();
        await StorageModel.coll.updateMany(
            { path: { $in: path }, autoDelete: { $exists: false } },
            { $set: { autoDelete } },
        );
    }

    static async list(target: string, recursive = true) {
        if (target.includes('..') || target.includes('//')) throw new Error('Invalid path');
        if (target.length && !target.endsWith('/')) target += '/';
        const results = recursive
            ? await StorageModel.coll.find({
                path: { $regex: new RegExp(`^${escapeRegExp(target)}`, 'i') },
                autoDelete: { $exists: false },
            }).toArray()
            : await StorageModel.coll.find({
                path: { $regex: new RegExp(`^${escapeRegExp(target)}[^/]+$`) },
                autoDelete: { $exists: false },
            }).toArray();
        return results.map((i) => ({
            ...i, name: i.path.split(target)[1], prefix: target,
        }));
    }

    static async getMeta(path: string) {
        const { value } = await StorageModel.coll.findOneAndUpdate(
            { path, autoDelete: { $exists: false } },
            { $set: { lastUsage: new Date() } },
            { returnDocument: 'after' },
        );
        if (!value) return null;
        return {
            ...value.meta,
            size: value.size,
            lastModified: value.lastModified,
            etag: value.etag,
        };
    }

    static async signDownloadLink(target: string, filename?: string, noExpire = false, useAlternativeEndpointFor?: 'user' | 'judge') {
        const res = await StorageModel.coll.findOneAndUpdate(
            { path: target, autoDelete: { $exists: false } },
            { $set: { lastUsage: new Date() } },
        );
        if (!res.value) return await storage.signDownloadLink(target, filename, noExpire, useAlternativeEndpointFor);
        return await storage.signDownloadLink(res.value._id, filename, noExpire, useAlternativeEndpointFor);
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
