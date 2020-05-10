const paginate = require('../lib/paginate');
const problem = require('../model/problem');
const contest = require('../model/contest');
const system = require('../model/system');
const user = require('../model/user');
const discussion = require('../model/discussion');
const {
    Route, Handler,
} = require('../service/server');
const {
    DiscussionNodeNotFoundError, DiscussionNotFoundError, DocumentNotFoundError,
} = require('../error');
const {
    PERM_VIEW_DISCUSSION, PERM_EDIT_DISCUSSION, PERM_EDIT_DISCUSSION_REPLY,
    PERM_VIEW_PROBLEM_HIDDEN, PERM_DELETE_DISCUSSION, PERM_DELETE_DISCUSSION_REPLY,
    PERM_HIGHLIGHT_DISCUSSION, PERM_LOGGEDIN, PERM_CREATE_DISCUSSION,
    PERM_REPLY_DISCUSSION,
} = require('../permission');

class DiscussionHandler extends Handler {
    async _prepare({
        type, docId, did, drid, drrid,
    }) {
        this.checkPerm(PERM_VIEW_DISCUSSION);
        if (did) {
            this.ddoc = await discussion.get(did);
            if (!this.ddoc) throw new DiscussionNotFoundError(did);
            type = this.ddoc.parentType;
            docId = this.ddoc.parentId;
            if (drid) {
                this.drdoc = await discussion.getReply(drid, did);
                if (!this.drdoc) throw new DiscussionNotFoundError(drid);
                if (this.drdoc.parent !== this.ddoc._id) throw new DocumentNotFoundError(drid);
                if (drrid) {
                    [, this.drrdoc] = await discussion.getTailReply(drid, drrid);
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
        if (type && docId) {
            if (type === 'problem') {
                const pdoc = await problem.getById(docId);
                if (!pdoc) throw new DiscussionNodeNotFoundError(type, docId);
                if (pdoc.hidden) this.checkPerm(PERM_VIEW_PROBLEM_HIDDEN);
                this.vnode = pdoc;
            } else if (type === 'contest') {
                const tdoc = await contest.get(docId);
                if (!tdoc) throw new DiscussionNodeNotFoundError(type, docId);
                this.vnode = tdoc;
            } else throw new DiscussionNodeNotFoundError(type, docId);
            this.vnode.parentType = type;
            this.vnode.parentId = docId;
        }
    }
}

class DiscussionMainHandler extends DiscussionHandler {
    async get({ page = 1 }) {
        const [ddocs, dpcount] = await paginate(
            discussion.getMulti(),
            page,
            await system.get('DISCUSSION_PER_PAGE'),
        );
        const udict = await user.getList(ddocs.map((ddoc) => ddoc.owner));
        const path = [
            ['Hydro', '/'],
            ['discussion_main', null],
        ];
        this.response.template = 'discussion_main_or_node.html';
        this.response.body = {
            ddocs, dpcount, udict, page, page_name: 'discussion_main', vnode: {}, path,
        };
    }
}

class DiscussionNodeHandler extends DiscussionHandler {
    async get({ type, docId, page = 1 }) {
        const [ddocs, dpcount] = await paginate(
            discussion.getMulti({ type, docId }),
            page,
            await system.get('DISCUSSION_PER_PAGE'),
        );
        const udict = await user.getList(ddocs.map((ddoc) => ddoc.owner));
        const path = [
            ['discussion_main', '/discuss'],
            [this.vnode.title, null, true],
        ];
        this.response.template = 'discussion_main_or_node.html';
        this.response.body = {
            ddocs,
            dpcount,
            udict,
            path,
            page,
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

    async get({ type, docId }) {
        const path = [
            ['discussion_main', '/discuss'],
            [this.vnode.title, `/discuss/${type}/${docId}`, true],
            ['discussion_create', null],
        ];
        this.response.template = 'discussion_create.html';
        this.response.body = { path, vnode: this.vnode };
    }

    async post({
        type, docId, title, content, highlight,
    }) {
        this.limitRate('add_discussion', 3600, 30);
        if (highlight) this.checkPerm(PERM_HIGHLIGHT_DISCUSSION);
        const did = await discussion.add(
            type, docId, this.user._id,
            title, content, this.request.ip, highlight,
        );
        this.response.body = { did };
        this.response.redirect = `/discuss/${did}`;
    }
}

class DiscussionDetailHandler extends DiscussionHandler {
    async get({ did, page = 1 }) {
        const dsdoc = this.user.hasPerm(PERM_LOGGEDIN)
            ? await discussion.getStatus(did, this.user._id)
            : null;
        const [drdocs, pcount, drcount] = await paginate(
            discussion.getMultiReply(did),
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
        const udict = await user.getList(uids);
        const path = [
            ['discussion_main', '/discuss'],
            [this.vnode.title, '/discuss/{type}', true],
            [this.ddoc.title, null, true],
        ];
        this.response.template = 'discussion_detail.html';
        this.response.body = {
            path, ddoc: this.ddoc, dsdoc, drdocs, page, pcount, drcount, udict,
        };
    }

    async postReply({ did, content }) {
        this.checkPerm(PERM_LOGGEDIN);
        this.checkPerm(PERM_REPLY_DISCUSSION);
        this.limitRate('add_discussion', 3600, 30);
        await discussion.addReply(did, this.user._id, content, this.request.ip);
        this.back();
    }

    async postTailReply({ drid, content }) {
        this.checkPerm(PERM_LOGGEDIN);
        this.checkPerm(PERM_REPLY_DISCUSSION);
        this.limitRate('add_discussion', 3600, 30);
        await discussion.addTailReply(drid, this.user._id, content, this.request.ip);
        this.back();
    }

    async postEditReply({ drid, content }) {
        if (this.drdoc.owner !== this.user._id) this.checkPerm(PERM_EDIT_DISCUSSION_REPLY);
        await discussion.editReply(drid, content);
        this.back();
    }

    async postDeleteReply({ drid }) {
        if (this.drdoc.owner !== this.user._id) this.checkPerm(PERM_DELETE_DISCUSSION_REPLY);
        await discussion.deleteReply(drid);
        this.back();
    }

    async postEditTailReply({ drid, drrid, content }) {
        if (this.drdoc.owner !== this.user._id) this.checkPerm(PERM_EDIT_DISCUSSION_REPLY);
        await discussion.editTailReply(drid, drrid, content);
        this.back();
    }

    async postDeleteTailReply({ drid, drrid }) {
        if (this.drrdoc.owner !== this.user._id) this.checkPerm(PERM_DELETE_DISCUSSION_REPLY);
        await discussion.deleteTailReply(drid, drrid);
        this.back();
    }

    async postStar({ did, star }) {
        await discussion.setStar(did, this.user._id, true);
        this.response.body = { star };
        this.response.direct = this.request.path;
    }

    async postUnstar({ did, star }) {
        await discussion.setStar(did, this.user._id, false);
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
        this.response.template = 'discussion_edit.html';
        this.response.body = { ddoc: this.ddoc };
    }

    async post({
        did, title, content, highlight, operation,
    }) {
        if (operation) return;
        if (this.ddoc.owner !== this.user._id) this.checkPerm(PERM_EDIT_DISCUSSION);
        if (highlight && !this.ddoc.highlight) this.checkPerm(PERM_HIGHLIGHT_DISCUSSION);
        await discussion.edit(did, title, content, highlight);
        this.response.body = { did };
        this.response.redirect = `/discuss/${did}`;
    }

    async postDelete({ did }) {
        if (this.ddoc.owner !== this.user._id) this.checkPerm(PERM_DELETE_DISCUSSION);
        await discussion.delete(did);
        this.response.body = { type: this.ddoc.type, parent: this.ddoc.parent };
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
    Route('/discuss/:type/:docId', module.exports.DiscussionNodeHandler);
    Route('/discuss/:type/:docId/create', module.exports.DiscussionCreateHandler);
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
