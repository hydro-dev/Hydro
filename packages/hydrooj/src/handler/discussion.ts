import { isSafeInteger } from 'lodash';
import { ObjectId } from 'mongodb';
import {
    DiscussionLockedError, DiscussionNodeNotFoundError, DiscussionNotFoundError, DocumentNotFoundError,
    PermissionError,
} from '../error';
import { DiscussionDoc, DiscussionReplyDoc, DiscussionTailReplyDoc } from '../interface';
import { PERM, PRIV } from '../model/builtin';
import * as discussion from '../model/discussion';
import * as document from '../model/document';
import message from '../model/message';
import * as oplog from '../model/oplog';
import user from '../model/user';
import { Handler, param, Types } from '../service/server';

export const typeMapper = {
    problem: document.TYPE_PROBLEM,
    contest: document.TYPE_CONTEST,
    node: document.TYPE_DISCUSSION_NODE,
    training: document.TYPE_TRAINING,
    homework: document.TYPE_CONTEST,
};

class DiscussionHandler extends Handler {
    ddoc?: DiscussionDoc;
    drdoc?: DiscussionReplyDoc;
    drrdoc?: DiscussionTailReplyDoc;
    vnode?: any;

    @param('type', Types.Range(Object.keys(typeMapper)), true)
    @param('name', Types.String, true)
    @param('did', Types.ObjectId, true)
    @param('drid', Types.ObjectId, true)
    @param('drrid', Types.ObjectId, true)
    async _prepare(
        domainId: string, type: string, name: string,
        did: ObjectId, drid: ObjectId, drrid: ObjectId,
    ) {
        this.checkPerm(PERM.PERM_VIEW_DISCUSSION);
        if (did) {
            this.ddoc = await discussion.get(domainId, did);
            if (!this.ddoc) throw new DiscussionNotFoundError(domainId, did);
            type = discussion.typeDisplay[this.ddoc.parentType];
            name = this.ddoc.parentId.toString();
            if (drrid) {
                [this.drdoc, this.drrdoc] = await discussion.getTailReply(domainId, drid, drrid);
                if (!this.drrdoc) throw new DiscussionNotFoundError(domainId, drrid);
            } else if (drid) {
                this.drdoc = await discussion.getReply(domainId, drid);
                if (!this.drdoc) throw new DiscussionNotFoundError(domainId, drid);
                if (!this.drdoc.parentId.equals(this.ddoc._id)) {
                    throw new DocumentNotFoundError(domainId, drid);
                }
            }
        }
        // TODO(twd2): exclude problem/contest discussions?
        // TODO(iceboy): continuation based pagination.
        this.vnode = await discussion.getVnode(domainId, typeMapper[type], name, this.user._id);
        if (!discussion.checkVNodeVisibility(typeMapper[type], this.vnode, this.user)) {
            throw new DiscussionNodeNotFoundError(domainId, this.vnode.id);
        }
        if (this.ddoc) {
            this.ddoc.parentType ||= this.vnode.type;
            this.ddoc.parentId ||= this.vnode.id;
        }
    }
}

class DiscussionMainHandler extends Handler {
    @param('page', Types.PositiveInt, true)
    @param('all', Types.Boolean)
    async get(domainId: string, page = 1, all = false) {
        // Limit to known types
        const parentType = { $in: Object.keys(typeMapper).map((i) => typeMapper[i]) };
        all &&= this.user.hasPerm(PERM.PERM_MOD_BADGE);
        const [ddocs, dpcount] = await this.paginate(
            discussion.getMulti(domainId, { parentType, ...all ? {} : { hidden: false } }).hint('discussionSort'),
            page,
            'discussion',
        );
        const udict = await user.getList(domainId, ddocs.map((ddoc) => ddoc.owner));
        const [vndict, vnodes] = await Promise.all([
            discussion.getListVnodes(domainId, ddocs, this.user.hasPerm(PERM.PERM_VIEW_PROBLEM_HIDDEN), this.user.group),
            discussion.getNodes(domainId),
        ]);
        this.response.template = 'discussion_main_or_node.html';
        this.response.body = {
            ddocs, dpcount, udict, page, page_name: 'discussion_main', vndict, vnode: {}, vnodes,
        };
    }
}

class DiscussionNodeHandler extends DiscussionHandler {
    @param('type', Types.Range(Object.keys(typeMapper)))
    @param('name', Types.String)
    @param('page', Types.PositiveInt, true)
    async get(domainId: string, type: string, _name: string, page = 1) {
        let name: ObjectId | string | number;
        if (ObjectId.isValid(_name)) name = new ObjectId(_name);
        else if (isSafeInteger(Number.parseInt(_name, 10))) name = Number.parseInt(_name, 10);
        else name = _name;
        const hidden = this.user.own(this.vnode) || this.user.hasPerm(PERM.PERM_EDIT_DISCUSSION) ? {} : { hidden: false };
        const [ddocs, dpcount] = await this.paginate(
            discussion.getMulti(domainId, { parentType: typeMapper[type], parentId: name, ...hidden }),
            page,
            'discussion',
        );
        const uids = ddocs.map((ddoc) => ddoc.owner);
        uids.push(this.vnode.owner);
        const [udict, vnodes] = await Promise.all([
            user.getList(domainId, uids),
            discussion.getNodes(domainId),
        ]);
        const vndict = { [typeMapper[type]]: { [name.toString()]: this.vnode } };
        this.response.template = 'discussion_main_or_node.html';
        this.response.body = {
            ddocs,
            dpcount,
            udict,
            page,
            vndict,
            vnode: this.vnode,
            page_name: 'discussion_node',
            vnodes,
        };
    }
}

class DiscussionCreateHandler extends DiscussionHandler {
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

    @param('type', Types.Range(Object.keys(typeMapper)))
    @param('title', Types.Title)
    @param('content', Types.Content)
    @param('highlight', Types.Boolean)
    @param('pin', Types.Boolean)
    async post(
        domainId: string, type: string, title: string,
        content: string, highlight = false, pin = false,
    ) {
        await this.limitRate('add_discussion', 3600, 60);
        if (highlight) this.checkPerm(PERM.PERM_HIGHLIGHT_DISCUSSION);
        if (pin) this.checkPerm(PERM.PERM_PIN_DISCUSSION);
        const hidden = this.vnode.hidden ?? false;
        const did = await discussion.add(
            domainId, typeMapper[type], this.vnode.id, this.user._id,
            title, content, this.request.ip, highlight, pin, hidden,
        );
        this.response.body = { did };
        this.response.redirect = this.url('discussion_detail', { did });
    }
}

class DiscussionDetailHandler extends DiscussionHandler {
    @param('did', Types.ObjectId)
    @param('page', Types.PositiveInt, true)
    async get(domainId: string, did: ObjectId, page = 1) {
        const dsdoc = this.user.hasPriv(PRIV.PRIV_USER_PROFILE)
            ? await discussion.getStatus(domainId, did, this.user._id)
            : null;
        const [drdocs, pcount, drcount] = await this.paginate(
            discussion.getMultiReply(domainId, did),
            page,
            'reply',
        );
        const uids = [
            ...this.vnode.owner ? [this.vnode.owner] : [],
            this.ddoc.owner,
            ...drdocs.map((drdoc) => drdoc.owner),
        ];
        for (const drdoc of drdocs) {
            if (drdoc.reply) uids.push(...drdoc.reply.map((drrdoc) => drrdoc.owner));
        }
        const reactions = { [did.toHexString()]: dsdoc?.react || {} };
        await Promise.all(drdocs.map((drdoc) =>
            discussion.getReaction(domainId, document.TYPE_DISCUSSION_REPLY, drdoc._id, this.user._id).then((reaction) => {
                reactions[drdoc._id.toHexString()] = reaction;
            })));
        const udict = await user.getList(domainId, uids);
        if (!dsdoc?.view && this.user.hasPriv(PRIV.PRIV_USER_PROFILE)) {
            await Promise.all([
                discussion.inc(domainId, did, 'views', 1),
                discussion.setStatus(domainId, did, this.user._id, { view: true }),
            ]);
        }
        const path = [
            ['Hydro', 'homepage'],
            ['discussion_main', 'discussion_main'],
            [this.vnode.title, 'discussion_node', { type: discussion.typeDisplay[this.ddoc.parentType], name: this.ddoc.parentId }, true],
            [this.ddoc.title, null, null, true],
        ];
        this.response.template = 'discussion_detail.html';
        this.response.body = {
            path, ddoc: this.ddoc, dsdoc, drdocs, page, pcount, drcount, udict, vnode: this.vnode, reactions,
        };
    }

    async post() {
        this.checkPriv(PRIV.PRIV_USER_PROFILE);
    }

    @param('did', Types.ObjectId)
    @param('lock', Types.Boolean)
    async postSetLock(domainId: string, did: ObjectId, lock: boolean) {
        if (!this.user.own(this.ddoc)) this.checkPerm(PERM.PERM_LOCK_DISCUSSION);
        await discussion.edit(domainId, did, { lock });
        this.back();
    }

    @param('nodeType', Types.Range(['did', 'drid']))
    @param('id', Types.ObjectId)
    @param('emoji', Types.Emoji)
    @param('reverse', Types.Boolean)
    async postReaction(domainId: string, type: string, did: ObjectId, id: string, reverse = false) {
        this.checkPerm(PERM.PERM_ADD_REACTION);
        const docType = type === 'did' ? document.TYPE_DISCUSSION : document.TYPE_DISCUSSION_REPLY;
        const [doc, sdoc] = await discussion.react(domainId, docType, did, id, this.user._id, reverse);
        this.response.body = { doc, sdoc };
        this.back();
    }

    @param('did', Types.ObjectId)
    @param('content', Types.Content)
    async postReply(domainId: string, did: ObjectId, content: string) {
        this.checkPerm(PERM.PERM_REPLY_DISCUSSION);
        if (this.ddoc.lock) throw new DiscussionLockedError(domainId, did);
        await this.limitRate('add_discussion', 3600, 60);
        const targets = new Set(Array.from(content.matchAll(/@\[\]\(\/user\/(\d+)\)/g)).map((i) => +i[1]));
        const uids = Object.keys(await user.getList(domainId, Array.from(targets))).map((i) => +i);
        const msg = JSON.stringify({
            message: 'User {0} mentioned you in {1:link}',
            params: [this.user.uname, `/d/${domainId}${this.request.path}`],
        });
        await message.send(1, uids, msg, message.FLAG_RICHTEXT | message.FLAG_UNREAD);
        const drid = await discussion.addReply(domainId, did, this.user._id, content, this.request.ip);
        this.back({ drid });
    }

    @param('drid', Types.ObjectId)
    @param('content', Types.Content)
    async postTailReply(domainId: string, drid: ObjectId, content: string) {
        this.checkPerm(PERM.PERM_REPLY_DISCUSSION);
        if (this.ddoc.lock) throw new DiscussionLockedError(domainId, this.ddoc.docId);
        await this.limitRate('add_discussion', 3600, 60);
        const targets = new Set(Array.from(content.matchAll(/@\[\]\(\/user\/(\d+)\)/g)).map((i) => +i[1]));
        const uids = Object.keys(await user.getList(domainId, Array.from(targets))).map((i) => +i);
        const msg = JSON.stringify({
            message: 'User {0} mentioned you in {1:link}',
            params: [this.user.uname, `/d/${domainId}${this.request.path}`],
        });
        await message.send(1, uids, msg, message.FLAG_RICHTEXT | message.FLAG_UNREAD);
        await discussion.addTailReply(domainId, drid, this.user._id, content, this.request.ip);
        this.back();
    }

    @param('drid', Types.ObjectId)
    @param('content', Types.Content)
    async postEditReply(domainId: string, drid: ObjectId, content: string) {
        this.checkPerm(PERM.PERM_EDIT_DISCUSSION_REPLY_SELF);
        if (!this.user.own(this.drdoc)) throw new PermissionError(PERM.PERM_EDIT_DISCUSSION_REPLY_SELF);
        await Promise.all([
            discussion.editReply(domainId, drid, content, this.user._id, this.request.ip),
            oplog.log(this, 'discussion.reply.edit', this.drdoc),
        ]);
        this.back();
    }

    @param('drid', Types.ObjectId)
    async postDeleteReply(domainId: string, drid: ObjectId) {
        const deleteBy = this.user.own(this.drdoc) ? 'self' : this.user.own(this.ddoc) ? 'DiscussionOwner' : 'Admin';
        if (!this.user.own(this.ddoc) || !this.user.hasPerm(PERM.PERM_DELETE_DISCUSSION_REPLY_SELF_DISCUSSION)) {
            if (!this.user.own(this.drdoc)) {
                this.checkPerm(PERM.PERM_DELETE_DISCUSSION_REPLY);
            } else this.checkPerm(PERM.PERM_DELETE_DISCUSSION_REPLY_SELF);
        }
        const msg = JSON.stringify({
            message: '{0} {1} delete your discussion reply {2} in "{3}"({4:link}).',
            params: [
                deleteBy,
                this.user.uname,
                this.drdoc.content.length > 10 ? `${this.drdoc.content.substring(0, 10)}...` : `${this.drdoc.content}`,
                this.ddoc.title,
                `/d/${domainId}${this.request.path}`,
            ],
        });
        await Promise.all([
            discussion.delReply(domainId, drid),
            deleteBy !== 'self' && message.send(1, this.drdoc.owner, msg, message.FLAG_RICHTEXT | message.FLAG_UNREAD),
            oplog.log(this, 'discussion.reply.delete', this.drdoc),
        ]);
        this.back();
    }

    @param('drid', Types.ObjectId)
    @param('drrid', Types.ObjectId)
    @param('content', Types.Content)
    async postEditTailReply(domainId: string, drid: ObjectId, drrid: ObjectId, content: string) {
        this.checkPerm(PERM.PERM_EDIT_DISCUSSION_REPLY_SELF);
        if (!this.user.own(this.drrdoc)) throw new PermissionError(PERM.PERM_EDIT_DISCUSSION_REPLY_SELF);
        await Promise.all([
            discussion.editTailReply(domainId, drid, drrid, content, this.user._id, this.request.ip),
            oplog.log(this, 'discussion.tailReply.edit', this.drrdoc),
        ]);
        this.back();
    }

    @param('drid', Types.ObjectId)
    @param('drrid', Types.ObjectId)
    async postDeleteTailReply(domainId: string, drid: ObjectId, drrid: ObjectId) {
        const deleteBy = this.user.own(this.drrdoc) ? 'self' : 'Admin';
        if (!this.user.own(this.drrdoc) || !this.user.hasPerm(PERM.PERM_DELETE_DISCUSSION_REPLY_SELF)) {
            this.checkPerm(PERM.PERM_DELETE_DISCUSSION_REPLY);
        }
        const msg = JSON.stringify({
            message: 'Admin {0} delete your discussion tail reply {1} in "{2}"({3:link}).',
            params: [
                this.user.uname,
                this.drrdoc.content.length > 10 ? `${this.drrdoc.content.substring(0, 10)}...` : this.drrdoc.content,
                this.ddoc.title,
                `/d/${domainId}${this.request.path}`,
            ],
        });
        await Promise.all([
            discussion.delTailReply(domainId, drid, drrid),
            deleteBy !== 'self' && message.send(1, this.drrdoc.owner, msg, message.FLAG_RICHTEXT | message.FLAG_UNREAD),
            oplog.log(this, 'discussion.tailReply.delete', this.drrdoc),
        ]);
        this.back();
    }

    @param('did', Types.ObjectId)
    @param('star', Types.Boolean)
    async postStar(domainId: string, did: ObjectId, star = false) {
        await discussion.setStar(domainId, did, this.user._id, star);
        this.back({ star });
    }
}

class DiscussionRawHandler extends DiscussionHandler {
    @param('did', Types.ObjectId, true)
    @param('drid', Types.ObjectId, true)
    @param('drrid', Types.ObjectId, true)
    @param('time', Types.UnsignedInt, true)
    @param('all', Types.Boolean)
    async get(domainId: string, did: ObjectId, drid: ObjectId, drrid: ObjectId, ts: number, all = false) {
        if (all) {
            this.response.body.history = await discussion.getHistory(domainId, drrid || drid || did);
        } else {
            const [doc] = await discussion.getHistory(domainId, drrid || drid || did, ts ? { time: new Date(ts) } : {});
            if (!doc) {
                if (ts) throw new DiscussionNotFoundError(drrid || drid || did);
                if (drrid && !this.drrdoc) throw new DiscussionNotFoundError(drrid);
                if (drid && !this.drdoc) throw new DiscussionNotFoundError(drid);
                if (did && !this.ddoc) throw new DiscussionNotFoundError(did);
            }
            this.response.type = 'text/markdown';
            this.response.body = doc ? doc.content : drrid ? this.drrdoc.content : drid ? this.drdoc.content : this.ddoc.content;
        }
    }
}

class DiscussionEditHandler extends DiscussionHandler {
    async get() {
        this.response.template = 'discussion_edit.html';
        this.response.body = { ddoc: this.ddoc };
    }

    @param('did', Types.ObjectId)
    @param('title', Types.Title)
    @param('content', Types.Content)
    @param('highlight', Types.Boolean)
    @param('pin', Types.Boolean)
    async postUpdate(
        domainId: string, did: ObjectId, title: string, content: string,
        highlight = false, pin = false,
    ) {
        if (!this.user.own(this.ddoc)) this.checkPerm(PERM.PERM_EDIT_DISCUSSION);
        else this.checkPerm(PERM.PERM_EDIT_DISCUSSION_SELF);
        if (!this.user.hasPerm(PERM.PERM_HIGHLIGHT_DISCUSSION)) highlight = this.ddoc.highlight;
        if (!this.user.hasPerm(PERM.PERM_PIN_DISCUSSION)) pin = this.ddoc.pin;
        const hidden = this.vnode.hidden ?? false;
        await Promise.all([
            discussion.edit(domainId, did, {
                title, highlight, pin, content, editor: this.user._id, edited: true, hidden,
            }),
            oplog.log(this, 'discussion.edit', this.ddoc),
        ]);
        this.response.body = { did };
        this.response.redirect = this.url('discussion_detail', { did });
    }

    @param('did', Types.ObjectId)
    async postDelete(domainId: string, did: ObjectId) {
        const deleteBy = this.user.own(this.ddoc) ? 'self' : 'Admin';
        if (!this.user.own(this.ddoc)) this.checkPerm(PERM.PERM_DELETE_DISCUSSION);
        else this.checkPerm(PERM.PERM_DELETE_DISCUSSION_SELF);
        const msg = JSON.stringify({
            message: 'Admin {0} delete your discussion "{1}".',
            params: [
                this.user.uname,
                this.ddoc.title,
            ],
        });
        await Promise.all([
            oplog.log(this, 'discussion.delete', this.ddoc),
            deleteBy !== 'self' && message.send(1, this.ddoc.owner, msg, message.FLAG_RICHTEXT | message.FLAG_UNREAD),
            discussion.del(domainId, did),
        ]);
        this.response.body = { type: this.ddoc.parentType, parent: this.ddoc.parentId };
        this.response.redirect = this.url('discussion_node', {
            type: discussion.typeDisplay[this.ddoc.parentType],
            name: this.ddoc.parentId,
        });
    }
}

export async function apply(ctx) {
    ctx.Route('discussion_main', '/discuss', DiscussionMainHandler, PERM.PERM_VIEW_DISCUSSION);
    ctx.Route('discussion_detail', '/discuss/:did', DiscussionDetailHandler);
    ctx.Route('discussion_edit', '/discuss/:did/edit', DiscussionEditHandler);
    ctx.Route('discussion_raw', '/discuss/:did/raw', DiscussionRawHandler);
    ctx.Route('discussion_reply_raw', '/discuss/:did/:drid/raw', DiscussionRawHandler);
    ctx.Route('discussion_tail_reply_raw', '/discuss/:did/:drid/:drrid/raw', DiscussionRawHandler);
    ctx.Route('discussion_node', '/discuss/:type/:name', DiscussionNodeHandler);
    ctx.Route('discussion_create', '/discuss/:type/:name/create', DiscussionCreateHandler, PRIV.PRIV_USER_PROFILE, PERM.PERM_CREATE_DISCUSSION);
}
