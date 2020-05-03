const { DocumentNotFoundError } = global.Hydro.error;
const { db } = global.Hydro.service;

const coll = db.collection('pastebin');

async function add({
    owner, language, expire, password, title, content,
}) {
    const doc = {
        owner, password, expire, language, title, content,
    };
    const res = await coll.insertOne(doc);
    return res.insertedId;
}

async function get(_id) {
    const doc = await coll.findOne({ _id });
    if (!doc) throw new DocumentNotFoundError(_id);
    return doc;
}

function del(_id) {
    return coll.deleteOne({ _id });
}

global.Hydro.model.pastebin = module.exports = { add, get, del };
