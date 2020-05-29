const { ForbiddenError } = require('../error');
const db = require('../service/db');
const fs = require('../service/gridfs');
const hash = require('../lib/hash.hydro');

const coll = db.collection('file');

function _timestamp() {
    return Math.floor(Number(new Date()) / 1000000);
}

async function add(stream, filename, meta = {}) {
    const file = await coll.insertOne(meta);
    const w = fs.openUploadStreamWithId(file.insertedId, filename);
    await new Promise((resolve, reject) => {
        stream.on('end', resolve);
        stream.on('error', reject);
        stream.pipe(w);
    });
    const c = await fs.find({ _id: file.insertedId }).toArray();
    await coll.updateOne({ _id: file.insertedId }, { $set: { md5: c[0].md5, size: c[0].size } });
    return file.insertedId;
}

function del(_id) {
    return Promise.all([
        coll.deleteOne({ _id }),
        fs.delete(_id),
    ]);
}

async function inc(_id) {
    const file = await coll.findOne({ _id });
    file.count++;
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
        if (!hash.check(file.secret, timestamp.toString(), secret)) {
            if (!hash.check(file.secret, timestamp.toString() - 1, secret)) {
                throw new ForbiddenError();
            }
        }
    }
    return fs.openDownloadStream(_id);
}

function getMeta(_id) {
    return coll.findOne({ _id });
}

async function url(_id, name) {
    const file = await coll.findOne({ _id });
    const secret = hash.hash(file.secret, _timestamp().toString());
    if (name) return `/fs/${_id}/${Buffer.from(name).toString('base64')}/${secret}`;
    return `/fs/${_id}/${secret}`;
}

global.Hydro.model.file = module.exports = {
    add, get, del, inc, dec, getMeta, url,
};
