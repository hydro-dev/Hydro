const { ObjectID } = require('mongodb');
const problem = require('./problem');
const document = require('./document');
const contest = require('./contest');
const training = require('./training');
const { PERM_VIEW_PROBLEM_HIDDEN } = require('./builtin').PERM;
const { DocumentNotFoundError } = require('../error');

const typeDisplay = {
    [document.TYPE_PROBLEM]: 'problem',
    [document.TYPE_CONTEST]: 'contest',
    [document.TYPE_DISCUSSION_NODE]: 'node',
    [document.TYPE_TRAINING]: 'training',
    [document.TYPE_HOMEWORK]: 'homework',
};

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
            views: 0,
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
    return Promise.all([
        document.deleteOne(domainId, document.TYPE_DISCUSSION, did),
        document.deleteMulti(domainId, document.TYPE_DISCUSSION_REPLY, {
            parentType: document.TYPE_DISCUSSION, parentId: did,
        }),
        document.deleteMultiStatus(domainId, document.TYPE_DISCUSSION, { docId: did }),
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
    return await Promise.all([
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

function addNode(domainId, _id, category, args) {
    return document.add(
        domainId, category, 1, document.TYPE_DISCUSSION_NODE,
        _id, null, null, args,
    );
}

function getNode(domainId, _id) {
    return document.get(domainId, document.TYPE_DISCUSSION_NODE, _id);
}

async function getVnode(domainId, ddoc, handler) {
    if (ddoc.parentType === document.TYPE_PROBLEM) {
        const pdoc = await problem.getById(domainId, ddoc.parentId);
        if (!pdoc) return null;
        if (pdoc.hidden && handler) handler.checkPerm(PERM_VIEW_PROBLEM_HIDDEN);
        return { ...pdoc, type: ddoc.parentType, id: ddoc.parentId };
    }
    if (ddoc.parentType === document.TYPE_CONTEST) {
        const tdoc = await contest.get(domainId, ddoc.parentId);
        return { ...tdoc, type: ddoc.parentType, id: ddoc.parentId };
    }
    if (ddoc.parentType === document.TYPE_DISCUSSION_NODE) {
        const ndoc = await getNode(domainId, ddoc.parentId);
        return {
            ...ndoc,
            title: ddoc.parentId,
            type: ddoc.parentType,
            id: ddoc.parentId,
        };
    }
    if (ddoc.parentType === document.TYPE_TRAINING) {
        const tdoc = await training.get(domainId, ddoc.parentId);
        return { ...tdoc, type: ddoc.parentType, id: ddoc.parentId };
    }
    if (ddoc.parentType === document.TYPE_HOMEWORK) {
        const tdoc = await contest.get(domainId, ddoc.parentId, document.TYPE_HOMEWORK);
        return { ...tdoc, type: ddoc.parentType, id: ddoc.parentId };
    }
    return {
        title: 'Missing Node',
        type: 'Unknown',
        id: new ObjectID(),
    };
}

function getNodes(domainId) {
    return document.getMulti(domainId, document.TYPE_DISCUSSION_NODE).toArray();
}

async function getListVnodes(domainId, ddocs, handler) {
    const tasks = [];
    const res = {};
    function task(ddoc) {
        return getVnode(domainId, ddoc, handler).then((vnode) => {
            if (!res[ddoc.parentType]) res[ddoc.parentType] = {};
            res[ddoc.parentType][ddoc.parentId] = vnode;
        });
    }
    for (const ddoc of ddocs) tasks.push(task(ddoc));
    await Promise.all(tasks);
    return res;
}

global.Hydro.model.discussion = module.exports = {
    typeDisplay,
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
    getNodes,
    getVnode,
    getListVnodes,
};
