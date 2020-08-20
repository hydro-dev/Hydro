import { ObjectID, Collection } from 'mongodb';
import * as fs from 'fs';
import { Dictionary } from 'lodash';
import { ForbiddenError, NotFoundError } from '../error';
import * as db from '../service/db';
import gridfs from '../service/gridfs';
import hash from '../lib/hash.hydro';
import { Ufdoc } from '../interface';

const coll: Collection<Ufdoc> = db.collection('file');
const collFile = db.collection('fs.files');
const collChunk = db.collection('fs.chunks');

function _timestamp() {
    return Math.floor(Number(new Date()) / 1000000);
}

export async function add(
    streamOrPath: fs.ReadStream | string, filename: string,
    owner = 1, meta = {},
) {
    let stream: fs.ReadStream;
    if (typeof streamOrPath === 'string') stream = fs.createReadStream(streamOrPath);
    else stream = streamOrPath;
    const w = gridfs.openUploadStream(filename);
    await coll.insertOne({
        ...meta,
        _id: w.id as ObjectID,
        secret: String.random(32),
        owner,
        filename,
    });
    await new Promise((resolve, reject) => {
        w.on('error', reject);
        w.on('finish', resolve);
        stream.pipe(w);
    });
    const c = await gridfs.find({ _id: w.id }).toArray();
    await coll.updateOne({ _id: w.id as ObjectID }, { $set: { md5: c[0].md5, size: c[0].length } });
    return w.id as ObjectID;
}

export function del(_id: ObjectID) {
    return Promise.all([
        coll.deleteOne({ _id }),
        collFile.deleteOne({ _id }),
        collChunk.deleteMany({ files_id: _id }),
    ]);
}

export async function getWithSecret(_id: ObjectID, secret: string, reject?: Function) {
    const file = await coll.findOne({ _id });
    if (!file) throw new NotFoundError(_id);
    const timestamp = _timestamp();
    if (!(hash(file.secret, timestamp.toString()) === secret)) {
        if (!(hash(file.secret, (timestamp - 1).toString()) === secret)) {
            throw new ForbiddenError();
        }
    }
    const stream = gridfs.openDownloadStream(_id);
    stream.on('error', (err) => {
        console.error(err);
        if (reject) reject(err);
    });
    return stream;
}

export async function get(_id: ObjectID, reject?: Function) {
    const file = await coll.findOne({ _id });
    if (!file) throw new NotFoundError(_id);
    const stream = gridfs.openDownloadStream(_id);
    stream.on('error', (err) => {
        console.error(err);
        if (reject) reject(err);
    });
    return stream;
}

export function getMeta(_id: ObjectID): Promise<Ufdoc> {
    return coll.findOne({ _id });
}

export async function getMetaDict(ufids: ObjectID[]): Promise<Dictionary<Ufdoc>> {
    const r = {};
    ufids = Array.from(new Set(ufids));
    const ufdocs = await coll.find({ _id: { $in: ufids } }).toArray();
    for (const ufdoc of ufdocs) {
        r[ufdoc._id.toHexString()] = ufdoc;
    }
    return r;
}

export function getMulti(query: any) {
    return coll.find(query);
}

async function _url(_id: ObjectID, name: string | undefined) {
    const file = await coll.findOne({ _id });
    const secret = hash(file.secret, _timestamp().toString());
    if (name) return `/fs/${_id}/${Buffer.from(name).toString('base64')}/${secret}`;
    return `/fs/${_id}/${secret}`;
}

function __url(file: any, name: string | undefined) {
    const secret = hash(file.secret, _timestamp().toString());
    if (name) return `/fs/${file._id}/${Buffer.from(name).toString('base64')}/${secret}`;
    return `/fs/${file._id}/${secret}`;
}

export function url(_id: ObjectID, name: string | undefined): Promise<string>;
export function url(file: any, name: string | undefined): string;
export function url(arg0: any, name: any) {
    if (arg0 instanceof ObjectID) return _url(arg0, name);
    return __url(arg0, name);
}

function ensureIndexes() {
    return Promise.all([
        collChunk.createIndex({ files_id: 1, n: 1 }, { unique: true }),
        collFile.createIndex({ md5: 1 }),
    ]);
}

global.Hydro.postInit.push(ensureIndexes);
global.Hydro.model.file = {
    add, get, del, getMeta, getWithSecret, getMulti, getMetaDict, url,
};
