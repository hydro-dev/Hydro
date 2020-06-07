const { ObjectID } = require('bson');
const paginate = require('../lib/paginate');
const system = require('../model/system');
const user = require('../model/user');
const discussion = require('../model/discussion');
const document = require('../model/document');
const { Route, Handler } = require('../service/server');
const { DiscussionNotFoundError, DocumentNotFoundError } = require('../error');
const {
    PERM_VIEW_DISCUSSION, PERM_EDIT_DISCUSSION, PERM_EDIT_DISCUSSION_REPLY,
    PERM_DELETE_DISCUSSION, PERM_DELETE_DISCUSSION_REPLY, PERM_HIGHLIGHT_DISCUSSION,
    PERM_LOGGEDIN, PERM_CREATE_DISCUSSION, PERM_REPLY_DISCUSSION,
} = require('../permission');

const typeMapper = {
    problem: document.TYPE_PROBLEM,
    contest: document.TYPE_CONTEST,
    node: document.TYPE_DISCUSSION_NODE,
    training: document.TYPE_TRAINING,
    homework: document.TYPE_HOMEWORK,
};

class DiscussionHandler extends Handler {
    async _prepare({
        domainId, type, name, did, drid, drrid,
    }) {
        this.checkPerm(PERM_VIEW_DISCUSSION);
        if (did) {
            this.ddoc = await discussion.get(domainId, did);
            if (!this.ddoc) throw new DiscussionNotFoundError(did);
            type = discussion.typeDisplay[this.ddoc.parentType];
            name = this.ddoc.parentId;
            if (drid) {
                this.drdoc = await discussion.getReply(domainId, drid, did);
                if (!this.drdoc) throw new DiscussionNotFoundError(drid);
                if (this.drdoc.parent !== this.ddoc._id) throw new DocumentNotFoundError(drid);
                if (drrid) {
                    [, this.drrdoc] = await discussion.getTailReply(domainId, drid, drrid);
                    if (!this.drrdoc) throw new DiscussionNotFoundError(drrid);
                    if (this.drrdoc.parent !== this.drdoc._id) {
                        throw new DocumentNotFoundError(drid);
                    }
                }
            }
        }
        // TODO(twd2): do more visibility check eg. contest
        // TODO(twd2): exclude problem/contest discussions?
        // TODO(iceboy): continuation based pagination.
        if (ObjectID.isValid(name)) name = new ObjectID(name);
        this.vnode = await discussion.getVnode(domainId, {
            parentType: typeMapper[type],
            parentId: name,
        }, this);
        if (this.ddoc) {
            this.ddoc.parentType = this.ddoc.parentType || this.vnode.type;
            this.ddoc.parentId = this.ddoc.parentId || this.vnode.id;
        }
    }
}

class DiscussionMainHandler extends Handler {
    async get({ domainId, page = 1 }) {
        const [ddocs, dpcount] = await paginate(
            discussion.getMulti(domainId),
            page,
            await system.get('DISCUSSION_PER_PAGE'),
        );
        const udict = await user.getList(domainId, ddocs.map((ddoc) => ddoc.owner));
        const path = [
            ['Hydro', '/'],
            ['discussion_main', null],
        ];
        const vndict = await discussion.getListVnodes(domainId, ddocs, this);
        this.response.template = 'discussion_main_or_node.html';
        this.response.body = {
            ddocs, dpcount, udict, page, page_name: 'discussion_main', vndict, vnode: {}, path,
        };
    }
}

class DiscussionNodeHandler extends DiscussionHandler {
    async get({
        domainId, type, name, page = 1,
    }) {
        const [ddocs, dpcount] = await paginate(
            discussion.getMulti(domainId, { parentType: typeMapper[type], parentId: name }),
            page,
            await system.get('DISCUSSION_PER_PAGE'),
        );
        const udict = await user.getList(domainId, ddocs.map((ddoc) => ddoc.owner));
        const path = [
            ['Hydro', '/'],
            ['discussion_main', '/discuss'],
            [this.vnode.title, null, true],
        ];
        const vndict = { [typeMapper[type]]: { [name]: this.vnode } };
        this.response.template = 'discussion_main_or_node.html';
        this.response.body = {
            ddocs,
            dpcount,
            udict,
            path,
            page,
            vndict,
            vnode: this.vnode,
            page_name: 'discussion_node',
        };
    }
}

class DiscussionCreateHandler extends DiscussionHandler {
    async prepare() {
        this.checkPerm(PERM_LOGGEDIN);
        this.checkPerm(PERM_CREATE_DISCUSSION);
    }

    async get({ type, name }) {
        const path = [
            ['Hydro', '/'],
            ['discussion_main', '/discuss'],
            [this.vnode.title, `/discuss/${type}/${name}`, true],
            ['discussion_create', null],
        ];
        this.response.template = 'discussion_create.html';
        this.response.body = { path, vnode: this.vnode };
    }

    async post({
        domainId, type, name, title, content, highlight,
    }) {
        this.limitRate('add_discussion', 3600, 30);
        if (ObjectID.isValid(name)) name = new ObjectID(name);
        if (highlight) this.checkPerm(PERM_HIGHLIGHT_DISCUSSION);
        const did = await discussion.add(
            domainId, typeMapper[type], name, this.user._id,
            title, content, this.request.ip, highlight,
        );
        this.response.body = { did };
        this.response.redirect = `/discuss/${did}`;
    }
}

class DiscussionDetailHandler extends DiscussionHandler {
    async get({ domainId, did, page = 1 }) {
        const dsdoc = this.user.hasPerm(PERM_LOGGEDIN)
            ? await discussion.getStatus(domainId, did, this.user._id)
            : null;
        const [drdocs, pcount, drcount] = await paginate(
            discussion.getMultiReply(domainId, did),
            page,
            await system.get('REPLY_PER_PAGE'),
        );
        const uids = drdocs.map((drdoc) => drdoc.owner);
        uids.push(this.ddoc.owner);
        for (const drdoc of drdocs) {
            if (drdoc.reply) {
                for (const drrdoc of drdocs) {
                    uids.push(drrdoc.owner);
                }
            }
        }
        const udict = await user.getList(domainId, uids);
        const path = [
            ['Hydro', '/'],
            ['discussion_main', '/discuss'],
            [this.vnode.title, `/discuss/${discussion.typeDisplay[this.ddoc.parentType]}/${this.ddoc.parentId}`, true],
            [this.ddoc.title, null, true],
        ];
        this.response.template = 'discussion_detail.html';
        this.response.body = {
            path, ddoc: this.ddoc, dsdoc, drdocs, page, pcount, drcount, udict, vnode: this.vnode,
        };
    }

    async postReply({ domainId, did, content }) {
        this.checkPerm(PERM_LOGGEDIN);
        this.checkPerm(PERM_REPLY_DISCUSSION);
        this.limitRate('add_discussion', 3600, 30);
        await discussion.addReply(domainId, did, this.user._id, content, this.request.ip);
        this.back();
    }

    async postTailReply({ domainId, drid, content }) {
        this.checkPerm(PERM_LOGGEDIN);
        this.checkPerm(PERM_REPLY_DISCUSSION);
        this.limitRate('add_discussion', 3600, 30);
        await discussion.addTailReply(domainId, drid, this.user._id, content, this.request.ip);
        this.back();
    }

    async postEditReply({ domainId, drid, content }) {
        if (this.drdoc.owner !== this.user._id) this.checkPerm(PERM_EDIT_DISCUSSION_REPLY);
        await discussion.editReply(domainId, drid, content);
        this.back();
    }

    async postDeleteReply({ domainId, drid }) {
        if (this.drdoc.owner !== this.user._id) this.checkPerm(PERM_DELETE_DISCUSSION_REPLY);
        await discussion.deleteReply(domainId, drid);
        this.back();
    }

    async postEditTailReply({
        domainId, drid, drrid, content,
    }) {
        if (this.drdoc.owner !== this.user._id) this.checkPerm(PERM_EDIT_DISCUSSION_REPLY);
        await discussion.editTailReply(domainId, drid, drrid, content);
        this.back();
    }

    async postDeleteTailReply({ domainId, drid, drrid }) {
        if (this.drrdoc.owner !== this.user._id) this.checkPerm(PERM_DELETE_DISCUSSION_REPLY);
        await discussion.deleteTailReply(domainId, drid, drrid);
        this.back();
    }

    async postStar({ domainId, did, star }) {
        await discussion.setStar(domainId, did, this.user._id, true);
        this.response.body = { star };
        this.response.direct = this.request.path;
    }

    async postUnstar({ domainId, did, star }) {
        await discussion.setStar(domainId, did, this.user._id, false);
        this.response.body = { star };
        this.response.direct = this.request.path;
    }
}

class DiscussionDetailRawHandler extends DiscussionHandler {
    async get() {
        this.response.type = 'text/markdown';
        this.response.body = this.ddoc.content;
    }
}

class DiscussionReplyRawHandler extends DiscussionHandler {
    async get() {
        this.response.type = 'text/markdown';
        this.response.body = this.drdoc.content;
    }
}


class DiscussionTailReplyRawHandler extends DiscussionHandler {
    async get() {
        this.response.type = 'text/markdown';
        this.response.body = this.drrdoc.content;
    }
}

class DiscussionEditHandler extends DiscussionHandler {
    async get() {
        if (this.ddoc.owner !== this.user._id) this.checkPerm(PERM_EDIT_DISCUSSION);
        const path = [
            ['Hydro', '/'],
            ['discussion_main', '/discuss'],
            [this.vnode.title, `/discuss/${this.ddoc.parentType}`, true],
            [this.ddoc.title, `/discuss/${this.ddoc.docId}`, true],
            ['discussion_edit', null],
        ];
        this.response.template = 'discussion_edit.html';
        this.response.body = { ddoc: this.ddoc, path };
    }

    async post({
        domainId, did, title, content, highlight, operation,
    }) {
        if (operation) return;
        if (this.ddoc.owner !== this.user._id) this.checkPerm(PERM_EDIT_DISCUSSION);
        if (highlight && !this.ddoc.highlight) this.checkPerm(PERM_HIGHLIGHT_DISCUSSION);
        await discussion.edit(domainId, did, title, content, highlight);
        this.response.body = { did };
        this.response.redirect = `/discuss/${did}`;
    }

    async postDelete({ domainId, did }) {
        if (this.ddoc.owner !== this.user._id) this.checkPerm(PERM_DELETE_DISCUSSION);
        await discussion.delete(domainId, did);
        this.response.body = { type: this.ddoc.parentType, parent: this.ddoc.parentId };
        this.response.redirect = `/discuss/${this.ddoc.type}/${this.ddoc.parent}`;
    }
}

async function apply() {
    Route('/discuss', module.exports.DiscussionMainHandler);
    Route('/discuss/:did', module.exports.DiscussionDetailHandler);
    Route('/discuss/:did/edit', module.exports.DiscussionEditHandler);
    Route('/discuss/:did/raw', module.exports.DiscussionDetailRawHandler);
    Route('/discuss/:did/:drid/raw', module.exports.DiscussionReplyRawHandler);
    Route('/discuss/:did/:drid/:drrid/raw', module.exports.DiscussionTailReplyRawHandler);
    Route('/discuss/:type/:name', module.exports.DiscussionNodeHandler);
    Route('/discuss/:type/:name/create', module.exports.DiscussionCreateHandler);
}

global.Hydro.handler.discussion = module.exports = {
    DiscussionMainHandler,
    DiscussionDetailHandler,
    DiscussionEditHandler,
    DiscussionDetailRawHandler,
    DiscussionReplyRawHandler,
    DiscussionTailReplyRawHandler,
    DiscussionNodeHandler,
    DiscussionCreateHandler,
    apply,
};
