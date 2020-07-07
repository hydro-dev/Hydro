import { ObjectID } from 'mongodb';
import { DiscussionNotFoundError, DocumentNotFoundError } from '../error';
import paginate from '../lib/paginate';
import * as system from '../model/system';
import * as user from '../model/user';
import * as discussion from '../model/discussion';
import * as document from '../model/document';
import { PERM, PRIV } from '../model/builtin';
import { Route, Handler } from '../service/server';

export const typeMapper = {
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
        this.checkPerm(PERM.PERM_VIEW_DISCUSSION);
        if (did) {
            this.ddoc = await discussion.get(domainId, did);
            if (!this.ddoc) throw new DiscussionNotFoundError(did);
            type = discussion.typeDisplay[this.ddoc.parentType];
            name = this.ddoc.parentId;
            if (drid) {
                this.drdoc = await discussion.getReply(domainId, drid);
                if (!this.drdoc) throw new DiscussionNotFoundError(drid);
                if (!this.drdoc.parentId.equals(this.ddoc._id)) {
                    throw new DocumentNotFoundError(drid);
                }
                if (drrid) {
                    [, this.drrdoc] = await discussion.getTailReply(domainId, drid, drrid);
                    if (!this.drrdoc) throw new DiscussionNotFoundError(drrid);
                    if (!this.drrdoc.parentId.equals(this.drdoc._id)) {
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
            ['Hydro', 'homepage'],
            ['discussion_main', null],
        ];
        const [vndict, vnodes] = await Promise.all([
            discussion.getListVnodes(domainId, ddocs, this),
            discussion.getNodes(domainId),
        ]);
        this.response.template = 'discussion_main_or_node.html';
        this.response.body = {
            ddocs, dpcount, udict, page, page_name: 'discussion_main', vndict, vnode: {}, path, vnodes,
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
        const [udict, vnodes] = await Promise.all([
            user.getList(domainId, ddocs.map((ddoc) => ddoc.owner)),
            discussion.getNodes(domainId),
        ]);
        const path = [
            ['Hydro', 'homepage'],
            ['discussion_main', 'discussion_main'],
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
            vnodes,
        };
    }
}

class DiscussionCreateHandler extends DiscussionHandler {
    async prepare() {
        this.checkPriv(PRIV.PRIV_USER_PROFILE);
        this.checkPerm(PERM.PERM_CREATE_DISCUSSION);
    }

    async get({ type, name }) {
        const path = [
            ['Hydro', 'homepage'],
            ['discussion_main', 'discussion_main'],
            [this.vnode.title, 'discussion_node', { type, name }, true],
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
        if (highlight) this.checkPerm(PERM.PERM_HIGHLIGHT_DISCUSSION);
        const did = await discussion.add(
            domainId, typeMapper[type], name, this.user._id,
            title, content, this.request.ip, highlight,
        );
        this.response.body = { did };
        this.response.redirect = this.url('discussion_detail', { did });
    }
}

class DiscussionDetailHandler extends DiscussionHandler {
    async get({ domainId, did, page = 1 }) {
        const dsdoc = this.user.hasPriv(PRIV.PRIV_USER_PROFILE)
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
            ['Hydro', 'homepage'],
            ['discussion_main', 'discussion_main'],
            [this.vnode.title, 'discussion_node', { type: discussion.typeDisplay[this.ddoc.parentType], name: this.ddoc.parentId }, true],
            [this.ddoc.title, null, null, true],
        ];
        this.response.template = 'discussion_detail.html';
        this.response.body = {
            path, ddoc: this.ddoc, dsdoc, drdocs, page, pcount, drcount, udict, vnode: this.vnode,
        };
    }

    async post() {
        this.checkPriv(PRIV.PRIV_USER_PROFILE);
    }

    async postReply({ domainId, did, content }) {
        this.checkPerm(PERM.PERM_REPLY_DISCUSSION);
        this.limitRate('add_discussion', 3600, 30);
        await discussion.addReply(domainId, did, this.user._id, content, this.request.ip);
        this.back();
    }

    async postTailReply({ domainId, drid, content }) {
        this.checkPerm(PERM.PERM_REPLY_DISCUSSION);
        this.limitRate('add_discussion', 3600, 30);
        await discussion.addTailReply(domainId, drid, this.user._id, content, this.request.ip);
        this.back();
    }

    async postEditReply({ domainId, drid, content }) {
        if (this.drdoc.owner !== this.user._id) this.checkPerm(PERM.PERM_EDIT_DISCUSSION_REPLY);
        await discussion.editReply(domainId, drid, content);
        this.back();
    }

    async postDeleteReply({ domainId, drid }) {
        if (this.drdoc.owner !== this.user._id) this.checkPerm(PERM.PERM_DELETE_DISCUSSION_REPLY);
        await discussion.delReply(domainId, drid);
        this.back();
    }

    async postEditTailReply({
        domainId, drid, drrid, content,
    }) {
        if (this.drdoc.owner !== this.user._id) this.checkPerm(PERM.PERM_EDIT_DISCUSSION_REPLY);
        await discussion.editTailReply(domainId, drid, drrid, content);
        this.back();
    }

    async postDeleteTailReply({ domainId, drid, drrid }) {
        if (this.drrdoc.owner !== this.user._id) this.checkPerm(PERM.PERM_DELETE_DISCUSSION_REPLY);
        await discussion.delTailReply(domainId, drid, drrid);
        this.back();
    }

    async postStar({ domainId, did }) {
        await discussion.setStar(domainId, did, this.user._id, true);
        this.back({ star: true });
    }

    async postUnstar({ domainId, did }) {
        await discussion.setStar(domainId, did, this.user._id, false);
        this.back({ star: false });
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
        const path = [
            ['Hydro', 'homepage'],
            ['discussion_main', 'discussion_main'],
            [this.vnode.title, 'discussion_node', { type: discussion.typeDisplay[this.ddoc.parentType], name: this.ddoc.parentId }, true],
            [this.ddoc.title, 'discussion_detail', { did: this.ddoc.docId }, true],
            ['discussion_edit', null],
        ];
        this.response.template = 'discussion_edit.html';
        this.response.body = { ddoc: this.ddoc, path };
    }

    async postUpdate({
        domainId, did, title, content, highlight,
    }) {
        if (this.ddoc.owner !== this.user._id) this.checkPerm(PERM.PERM_EDIT_DISCUSSION);
        if (highlight && !this.ddoc.highlight) this.checkPerm(PERM.PERM_HIGHLIGHT_DISCUSSION);
        await discussion.edit(domainId, did, title, content, highlight);
        this.response.body = { did };
        this.response.redirect = this.url('discussion_detail', { did });
    }

    async postDelete({ domainId, did }) {
        if (this.ddoc.owner !== this.user._id) this.checkPerm(PERM.PERM_DELETE_DISCUSSION);
        await discussion.del(domainId, did);
        this.response.body = { type: this.ddoc.parentType, parent: this.ddoc.parentId };
        this.response.redirect = this.url('discussion_node', {
            type: discussion.typeDisplay[this.ddoc.parentType],
            name: this.ddoc.parentId,
        });
    }
}

export async function apply() {
    Route('discussion_main', '/discuss', DiscussionMainHandler);
    Route('discussion_detail', '/discuss/:did', DiscussionDetailHandler);
    Route('discussion_edit', '/discuss/:did/edit', DiscussionEditHandler);
    Route('discussion_detail', '/discuss/:did/raw', DiscussionDetailRawHandler);
    Route('discussion_reply_raw', '/discuss/:did/:drid/raw', DiscussionReplyRawHandler);
    Route('discussion_tail_reply_raw', '/discuss/:did/:drid/:drrid/raw', DiscussionTailReplyRawHandler);
    Route('discussion_node', '/discuss/:type/:name', DiscussionNodeHandler);
    Route('discussion_create', '/discuss/:type/:name/create', DiscussionCreateHandler);
}

global.Hydro.handler.discussion = apply;
