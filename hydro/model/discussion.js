const { ObjectID } = require('bson');
const problem = require('./problem');
const document = require('./document');
const contest = require('./contest');
const { PERM_VIEW_PROBLEM_HIDDEN } = require('../permission');
const { DocumentNotFoundError } = require('../error');

function add(domainId, parentType, parentId, owner, title, content, ip = null, highlight = false) {
    return document.add(
        domainId, content, owner, document.TYPE_DISCUSSION,
        null, parentType, parentId,
        {
            title,
            ip,
            highlight,
            nReply: 0,
            updateAt: new Date(),
        },
    );
}

function get(domainId, did) {
    return document.get(domainId, document.TYPE_DISCUSSION, did);
}

function edit(domainId, did, title, content, highlight) {
    return document.set(domainId, document.TYPE_DISCUSSION, did, { title, content, highlight });
}

function del(domainId, did) {
    // TODO(masnn) delete status
    return Promise.all([
        document.deleteOne(domainId, document.TYPE_DISCUSSION, did),
        document.deleteMulti(domainId, document.TYPE_DISCUSSION_REPLY, {
            parentType: document.TYPE_DISCUSSION, parentId: did,
        }),
    ]);
}

function count(domainId, query) {
    return document.count(domainId, document.TYPE_DISCUSSION, query);
}

function getMulti(domainId, query) {
    return document.getMulti(domainId, document.TYPE_DISCUSSION, query).sort('updateAt', -1);
}

async function addReply(domainId, did, owner, content, ip) {
    const [drdoc] = await Promise.all([
        document.add(
            domainId, content, owner, document.TYPE_DISCUSSION_REPLY,
            null, document.TYPE_DISCUSSION, did, { ip },
        ),
        document.incAndSet(domainId, document.TYPE_DISCUSSION, did, 'nReply', 1, { updateAt: new Date() }),
    ]);
    return drdoc;
}

function getReply(domainId, drid) {
    return document.get(domainId, document.TYPE_DISCUSSION_REPLY, drid);
}

function editReply(domainId, drid, content) {
    return document.set(domainId, document.TYPE_DISCUSSION_REPLY, drid, { content });
}

async function delReply(domainId, drid) {
    const drdoc = await getReply(domainId, drid);
    if (!drdoc) throw new DocumentNotFoundError(drid);
    return await Promise.all([ // eslint-disable-line no-return-await
        document.deleteOne(domainId, document.TYPE_DISCUSSION_REPLY, drid),
        document.inc(domainId, document.TYPE_DISCUSSION, drdoc.parentId, 'nReply', -1),
    ]);
}

function getMultiReply(domainId, did) {
    return document.getMulti(
        domainId, document.TYPE_DISCUSSION_REPLY,
        { parentType: document.TYPE_DISCUSSION, parentId: did },
    ).sort('_id', -1);
}

function getListReply(domainId, did) {
    return getMultiReply(domainId, did).toArray();
}

async function addTailReply(domainId, drid, owner, content, ip) {
    let drdoc = await document.get(domainId, document.TYPE_DISCUSSION_REPLY, drid);
    const sid = new ObjectID();
    [drdoc] = await Promise.all([
        document.push(domainId, document.TYPE_DISCUSSION_REPLY, drid, 'reply', content, owner, { ip }),
        document.set(domainId, document.TYPE_DISCUSSION, drdoc.parentId, { updateAt: new Date() }),
    ]);
    return [drdoc, sid];
}

function getTailReply(domainId, drid, drrid) {
    return document.getSub(domainId, document.TYPE_DISCUSSION_REPLY, drid, 'reply', drrid);
}

function editTailReply(domainId, drid, drrid, content) {
    return document.setSub(domainId, document.TYPE_DISCUSSION_REPLY, drid, 'reply', drrid, { content });
}

function delTailReply(domainId, drid, drrid) {
    return document.deleteSub(domainId, document.TYPE_DISCUSSION_REPLY, drid, 'reply', drrid);
}

function setStar(domainId, did, uid, star) {
    return document.setStatus(domainId, document.TYPE_DISCUSSION, did, uid, { star });
}

function getStatus(domainId, did, uid) {
    return document.getStatus(domainId, document.TYPE_DISCUSSION, did, uid);
}

function addNode(domainId, _id, category) {
    return document.add(
        domainId, _id, 1, document.TYPE_DISCUSSION_NODE, null, null, null, { category },
    );
}

function getNode(domainId, _id) {
    return document.get(domainId, document.TYPE_DISCUSSION_NODE, _id);
}

async function getVnode(domainId, ddoc, handler) {
    if (ddoc.parentType === 'problem') {
        const pdoc = await problem.getById(domainId, ddoc.parentId);
        if (!pdoc) return null;
        if (pdoc.hidden && handler) handler.checkPerm(PERM_VIEW_PROBLEM_HIDDEN);
        return { ...pdoc, type: ddoc.parentType, id: ddoc.parentId };
    } if (ddoc.parentType === 'contest') {
        const tdoc = await contest.get(domainId, ddoc.parentId);
        return { ...tdoc, type: ddoc.parentType, id: ddoc.parentId };
    } if (ddoc.parentType === 'node') {
        const ndoc = await getNode(domainId, ddoc.parentId);
        return { title: ndoc._id, type: ddoc.parentType, id: ddoc.parentId };
    }
    return {
        title: 'Missing Node',
        type: 'Unknown',
        id: new ObjectID(),
    };
}

async function getListVnodes(domainId, ddocs, handler) {
    const res = {};
    for (const ddoc of ddocs) {
        // FIXME no-await-in-loop
        res[ddoc._id] = await getVnode(domainId, ddoc, handler); // eslint-disable-line no-await-in-loop
    }
    return res;
}

global.Hydro.model.discussion = module.exports = {
    add,
    get,
    edit,
    del,
    count,
    getMulti,
    addReply,
    getReply,
    editReply,
    delReply,
    getMultiReply,
    getListReply,
    addTailReply,
    getTailReply,
    editTailReply,
    delTailReply,
    setStar,
    getStatus,
    addNode,
    getVnode,
    getListVnodes,
};
