import { ObjectID } from 'mongodb';
import * as fs from 'fs';
import { ForbiddenError, NotFoundError } from '../error';
import * as db from '../service/db';
import gridfs from '../service/gridfs';
import hash from '../lib/hash.hydro';

const coll = db.collection('file');
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
        ...meta, _id: w.id, secret: String.random(32), owner, filename,
    });
    await new Promise((resolve, reject) => {
        w.on('error', reject);
        w.on('finish', resolve);
        stream.pipe(w);
    });
    const c = await gridfs.find({ _id: w.id }).toArray();
    await coll.updateOne({ _id: w.id }, { $set: { md5: c[0].md5, size: c[0].length } });
    return w.id as ObjectID;
}

export function del(_id: ObjectID) {
    return Promise.all([
        coll.deleteOne({ _id }),
        collFile.deleteOne({ _id }),
        collChunk.deleteMany({ files_id: _id }),
    ]);
}

export async function inc(_id: ObjectID) {
    const doc = await coll.findOneAndUpdate(
        { _id },
        { $inc: { count: 1 } },
        { returnOriginal: false },
    );
    return (doc.value || {}).count;
}

export async function dec(_id: ObjectID) {
    const file = await coll.findOneAndUpdate(
        { _id },
        { $inc: { count: -1 } },
        { returnOriginal: false },
    );
    if (!file.value.count) await del(_id);
    return file.value.count;
}

export async function getWithSecret(_id: ObjectID, secret: string) {
    const file = await coll.findOne({ _id });
    if (!file) throw new NotFoundError(_id);
    const timestamp = _timestamp();
    if (!(hash(file.secret, timestamp.toString()) === secret)) {
        if (!(hash(file.secret, (timestamp - 1).toString()) === secret)) {
            throw new ForbiddenError();
        }
    }
    return gridfs.openDownloadStream(_id);
}

export async function get(_id: ObjectID) {
    const file = await coll.findOne({ _id });
    if (!file) throw new NotFoundError(_id);
    return gridfs.openDownloadStream(_id);
}

export function getMeta(_id: ObjectID) {
    return coll.findOne({ _id });
}

export async function getMetaDict(ufids: ObjectID[]) {
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

global.Hydro.model.file = {
    add, get, del, inc, dec, getMeta, getWithSecret, getMulti, getMetaDict, url,
};
