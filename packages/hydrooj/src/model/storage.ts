import { extname } from 'path';
import { escapeRegExp, omit } from 'lodash';
import moment from 'moment-timezone';
import { nanoid } from 'nanoid';
import type { Readable } from 'stream';
import { Context } from '../context';
import { FileNode } from '../interface';
import mime from '../lib/mime';
import db from '../service/db';
import storage from '../service/storage';
import ScheduleModel from './schedule';
import * as system from './system';

export class StorageModel {
    static coll = db.collection('storage');

    static generateId(ext: string) {
        return `${nanoid(3).replace(/[_-]/g, '0')}/${nanoid().replace(/[_-]/g, '0')}${ext}`.toLowerCase();
    }

    static async put(path: string, file: string | Buffer | Readable, owner?: number) {
        const meta = {};
        await StorageModel.del([path]);
        meta['Content-Type'] = mime(path);
        let _id = StorageModel.generateId(extname(path));
        // Make sure id is not used
        // eslint-disable-next-line no-await-in-loop
        while (await StorageModel.coll.findOne({ _id })) _id = StorageModel.generateId(extname(path));
        await storage.put(_id, file, meta);
        const { metaData, size, etag } = await storage.getMeta(_id);
        await StorageModel.coll.insertOne({
            _id, meta: metaData, path, size, etag, lastModified: new Date(), owner,
        });
        return path;
    }

    static async get(path: string, savePath?: string) {
        const value = await StorageModel.coll.findOneAndUpdate(
            { path, autoDelete: null },
            { $set: { lastUsage: new Date() } },
            { returnDocument: 'after' },
        );
        return await storage.get(value?.link || value?._id || path, savePath);
    }

    static async rename(path: string, newPath: string, operator: null | number = 1) {
        return await StorageModel.coll.updateOne(
            { path, autoDelete: null },
            { $set: { path: newPath }, ...(operator !== null ? { $push: { operator } } : {}) },
        );
    }

    private static async _swapId(fileA: FileNode, fileB: FileNode) {
        // try to swap the two file with same content to make sure the first file is no longer being referenced
        // Example
        // _id: A, path: C, meta: R
        // _id: B, path: D, link: A, meta: P
        // and we want to delete path=B, the result should be
        // _id: A, path: D, meta: P
        // _id: B, path: C, link: A, meta: R
        await Promise.all([
            StorageModel.coll.updateOne({ _id: fileA._id }, { $set: omit(fileB, ['_id', 'link']) }),
            StorageModel.coll.updateOne({ _id: fileB._id }, { $set: omit(fileA, ['_id', 'link']) }),
        ]);
    }

    static async del(path: string[], operator = 1) {
        if (!path.length) return;
        // files pending to be deleted
        const pendingDelete = await StorageModel.coll.find({ path: { $in: path }, autoDelete: null }).toArray();
        if (!pendingDelete.length) return;
        // all files not going to be deleted but affected (referencing to the files to be deleted)
        const linked = await StorageModel.coll.find({ link: { $in: pendingDelete.map((i) => i._id) }, path: { $nin: path } }).toArray();
        const fileIds = [];
        for (const i of pendingDelete) {
            const affected = linked.filter((t) => t.link === i._id);
            if (!affected.length) {
                fileIds.push(i._id);
                continue;
            }
            await StorageModel._swapId(i, affected[0]); // eslint-disable-line no-await-in-loop
            fileIds.push(affected[0]._id); // we already swapped the two files, so we need to delete the other one
        }
        const autoDelete = moment().add(7, 'day').toDate();
        await StorageModel.coll.updateMany(
            { _id: { $in: fileIds } },
            { $set: { autoDelete }, $push: { operator } },
        );
    }

    static async list(target: string, recursive = true) {
        if (target.includes('..') || target.includes('//')) throw new Error('Invalid path');
        if (target.length && !target.endsWith('/')) target += '/';
        const results = await StorageModel.coll.find({
            path: { $regex: `^${escapeRegExp(target)}${recursive ? '' : '[^/]+$'}` },
            autoDelete: null,
        }).toArray();
        return results.map((i) => ({
            ...i, name: i.path.split(target)[1],
        }));
    }

    static async getMeta(path: string) {
        const value = await StorageModel.coll.findOneAndUpdate(
            { path, autoDelete: null },
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
            { path: target, autoDelete: null },
            { $set: { lastUsage: new Date() } },
        );
        return await storage.signDownloadLink(res?.link || res?._id || target, filename, noExpire, useAlternativeEndpointFor);
    }

    static async move(src: string, dst: string) {
        const res = await StorageModel.coll.findOneAndUpdate(
            { path: src, autoDelete: null },
            { $set: { path: dst } },
        );
        return !!res;
    }

    static async exists(path: string) {
        const value = await StorageModel.coll.findOne({ path, autoDelete: null });
        return !!value;
    }

    static async copy(src: string, dst: string) {
        const value = await StorageModel.coll.findOneAndUpdate(
            { path: src, autoDelete: null },
            { $set: { lastUsage: new Date() } },
            { returnDocument: 'after' },
        );
        if (!value) throw new Error(`Original file ${src} not found`);
        const meta = {};
        await StorageModel.del([dst]);
        meta['Content-Type'] = mime(dst);
        let _id = StorageModel.generateId(extname(dst));
        // Make sure id is not used
        // eslint-disable-next-line no-await-in-loop
        while (await StorageModel.coll.findOne({ _id })) _id = StorageModel.generateId(extname(dst));
        await StorageModel.coll.insertOne({
            ...value, _id, path: dst, link: value.link || value._id, lastModified: new Date(), owner: value.owner || 1,
        });
        return _id;
    }
}

async function cleanFiles() {
    const submissionKeepDate = system.get('submission.saveDays');
    if (submissionKeepDate) {
        const shouldDelete = moment().subtract(submissionKeepDate, 'day').toDate();
        const res = await StorageModel.coll.find({
            path: /^submission\//g,
            lastModified: { $lt: shouldDelete },
        }).toArray();
        const paths = res.map((i) => i.path);
        await StorageModel.del(paths);
    }
    if (system.get('server.keepFiles')) return;
    let res = await StorageModel.coll.findOneAndDelete({ autoDelete: { $lte: new Date() } });
    while (res) {
        // eslint-disable-next-line no-await-in-loop
        if (!res.link) await storage.del(res._id);
        // eslint-disable-next-line no-await-in-loop
        res = await StorageModel.coll.findOneAndDelete({ autoDelete: { $lte: new Date() } });
    }
}

export async function apply(ctx: Context) {
    ctx.on('domain/delete', async (domainId) => {
        const [problemFiles, contestFiles, trainingFiles] = await Promise.all([
            StorageModel.list(`problem/${domainId}`),
            StorageModel.list(`contest/${domainId}`),
            StorageModel.list(`training/${domainId}`),
        ]);
        await StorageModel.del(problemFiles.concat(contestFiles).concat(trainingFiles).map((i) => i.path));
    });
    await ctx.inject(['worker'], (c) => {
        c.worker.addHandler('storage.prune', cleanFiles);
    });
    if (process.env.NODE_APP_INSTANCE !== '0') return;
    await db.ensureIndexes(
        StorageModel.coll,
        { key: { path: 1 }, name: 'path' },
        { key: { path: 1, autoDelete: 1 }, sparse: true, name: 'autoDelete' },
        { key: { link: 1 }, sparse: true, name: 'link' },
    );
    if (!await ScheduleModel.count({ type: 'schedule', subType: 'storage.prune' })) {
        await ScheduleModel.add({
            type: 'schedule',
            subType: 'storage.prune',
            executeAfter: moment().startOf('hour').toDate(),
            interval: [1, 'hour'],
        });
    }
}

global.Hydro.model.storage = StorageModel;
export default StorageModel;
