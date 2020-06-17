const fs = require('fs');
const { ForbiddenError } = require('../error');
const db = require('../service/db');
const gridfs = require('../service/gridfs');
const hash = require('../lib/hash.hydro');

const coll = db.collection('file');
const collFile = db.collection('fs.files');
const collChunk = db.collection('fs.chunks');

function _timestamp() {
    return Math.floor(Number(new Date()) / 1000000);
}

async function add(streamOrPath, filename, meta = {}) {
    if (typeof streamOrPath === 'string') streamOrPath = fs.createReadStream(streamOrPath);
    const w = gridfs.openUploadStream(filename);
    await coll.insertOne({ ...meta, _id: w.id });
    await new Promise((resolve, reject) => {
        w.on('error', reject);
        w.on('finish', resolve);
        streamOrPath.pipe(w);
    });
    const c = await gridfs.find({ _id: w.id }).toArray();
    await coll.updateOne({ _id: w.id }, { $set: { md5: c[0].md5, size: c[0].size } });
    return w.id;
}

function del(_id) {
    return Promise.all([
        coll.deleteOne({ _id }),
        collFile.deleteOne({ _id }),
        collChunk.deleteMany({ files_id: _id }),
    ]);
}

async function inc(_id) {
    const doc = await coll.findOneAndUpdate(
        { _id },
        { $inc: { count: 1 } },
        { returnOriginal: false },
    );
    return (doc.value || {}).count;
}

async function dec(_id) {
    const file = await coll.findOneAndUpdate(
        { _id },
        { $inc: { count: -1 } },
        { returnOriginal: false },
    );
    if (!file.count) await del(_id);
    return file.count;
}

async function get(_id, secret) {
    const file = await coll.findOne({ _id });
    if (typeof secret !== 'undefined') {
        const timestamp = _timestamp();
        if (!(hash(file.secret, timestamp.toString()) === secret)) {
            if (!(hash(file.secret, timestamp.toString() - 1) === secret)) {
                throw new ForbiddenError();
            }
        }
    }
    return gridfs.openDownloadStream(_id);
}

function getMeta(_id) {
    return coll.findOne({ _id });
}

async function url(_id, name) {
    const file = await coll.findOne({ _id });
    const secret = hash(file.secret, _timestamp().toString());
    if (name) return `/fs/${_id}/${Buffer.from(name).toString('base64')}/${secret}`;
    return `/fs/${_id}/${secret}`;
}

global.Hydro.model.file = module.exports = {
    add, get, del, inc, dec, getMeta, url,
};
