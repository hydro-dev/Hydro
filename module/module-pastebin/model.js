const { DocumentNotFoundError } = global.Hydro.error;
const { document } = global.Hydro.model;

document.TYPE_PASTE = 101;

function add({
    owner, language, expire, password, title, content,
}) {
    return document.add(
        'system', content, owner, document.TYPE_PASTE, null, null, null,
        {
            language, expire, title, password,
        },
    );
}

async function get(_id) {
    const doc = await document.get('system', document.TYPE_PASTE, _id);
    if (!doc) throw new DocumentNotFoundError(_id);
    return doc;
}

function del(_id) {
    return document.deleteOne('system', document.TYPE_PASTE, _id);
}

global.Hydro.model.pastebin = module.exports = { add, get, del };
