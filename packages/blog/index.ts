import {
    _, Context, DiscussionNotFoundError, DocumentModel, Filter,
    Handler, NumberKeys, ObjectId, OplogModel,
    param, PRIV, SettingModel, Types, UserModel,
} from 'hydrooj';

export const TYPE_BLOG = 70 as const;
export interface BlogDoc {
    docType: 70;
    docId: ObjectId;
    owner: number;
    title: string;
    content: string;
    ip: string;
    updateAt: Date;
    nReply: number;
    views: number;
    reply: any[];
    react: Record<string, number>;
}
declare module 'hydrooj' {
    interface Model {
        blog: typeof BlogModel;
    }
    interface DocType {
        [TYPE_BLOG]: BlogDoc;
    }
}

export class BlogModel {
    static async add(
        owner: number, title: string, content: string, ip?: string,
    ): Promise<ObjectId> {
        const payload: Partial<BlogDoc> = {
            content,
            owner,
            title,
            ip,
            nReply: 0,
            updateAt: new Date(),
            views: 0,
        };
        const res = await DocumentModel.add(
            'system', payload.content!, payload.owner!, TYPE_BLOG,
            null, null, null, _.omit(payload, ['domainId', 'content', 'owner']),
        );
        payload.docId = res;
        return payload.docId;
    }

    static async get(did: ObjectId): Promise<BlogDoc> {
        return await DocumentModel.get('system', TYPE_BLOG, did);
    }

    static edit(did: ObjectId, title: string, content: string): Promise<BlogDoc> {
        const payload = { title, content };
        return DocumentModel.set('system', TYPE_BLOG, did, payload);
    }

    static inc(did: ObjectId, key: NumberKeys<BlogDoc>, value: number): Promise<BlogDoc | null> {
        return DocumentModel.inc('system', TYPE_BLOG, did, key, value);
    }

    static del(did: ObjectId): Promise<never> {
        return Promise.all([
            DocumentModel.deleteOne('system', TYPE_BLOG, did),
            DocumentModel.deleteMultiStatus('system', TYPE_BLOG, { docId: did }),
        ]) as any;
    }

    static count(query: Filter<BlogDoc>) {
        return DocumentModel.count('system', TYPE_BLOG, query);
    }

    static getMulti(query: Filter<BlogDoc> = {}) {
        return DocumentModel.getMulti('system', TYPE_BLOG, query)
            .sort({ _id: -1 });
    }

    static async addReply(did: ObjectId, owner: number, content: string, ip: string): Promise<ObjectId> {
        const [[, drid]] = await Promise.all([
            DocumentModel.push('system', TYPE_BLOG, did, 'reply', content, owner, { ip }),
            DocumentModel.incAndSet('system', TYPE_BLOG, did, 'nReply', 1, { updateAt: new Date() }),
        ]);
        return drid;
    }

    static setStar(did: ObjectId, uid: number, star: boolean) {
        return DocumentModel.setStatus('system', TYPE_BLOG, did, uid, { star });
    }

    static getStatus(did: ObjectId, uid: number) {
        return DocumentModel.getStatus('system', TYPE_BLOG, did, uid);
    }

    static setStatus(did: ObjectId, uid: number, $set) {
        return DocumentModel.setStatus('system', TYPE_BLOG, did, uid, $set);
    }
}

global.Hydro.model.blog = BlogModel;

class BlogHandler extends Handler {
    ddoc?: BlogDoc;

    @param('did', Types.ObjectId, true)
    async _prepare(domainId: string, did: ObjectId) {
        if (did) {
            this.ddoc = await BlogModel.get(did);
            if (!this.ddoc) throw new DiscussionNotFoundError(domainId, did);
        }
    }
}

class BlogUserHandler extends BlogHandler {
    @param('uid', Types.Int)
    @param('page', Types.PositiveInt, true)
    async get(domainId: string, uid: number, page = 1) {
        const [ddocs, dpcount] = await this.ctx.db.paginate(
            BlogModel.getMulti({ owner: uid }),
            page,
            10,
        );
        const udoc = await UserModel.getById(domainId, uid);
        this.response.template = 'blog_main.html';
        this.response.body = {
            ddocs,
            dpcount,
            udoc,
            page,
        };
    }
}

class BlogDetailHandler extends BlogHandler {
    @param('did', Types.ObjectId)
    async get({ domainId }, did: ObjectId) {
        const dsdoc = this.user.hasPriv(PRIV.PRIV_USER_PROFILE)
            ? await BlogModel.getStatus(did, this.user._id)
            : null;
        const udoc = await UserModel.getById(domainId, this.ddoc!.owner);
        if (!dsdoc?.view) {
            await Promise.all([
                BlogModel.inc(did, 'views', 1),
                BlogModel.setStatus(did, this.user._id, { view: true }),
            ]);
        }
        this.response.template = 'blog_detail.html';
        this.response.body = {
            ddoc: this.ddoc, dsdoc, udoc,
        };
    }

    async post() {
        this.checkPriv(PRIV.PRIV_USER_PROFILE);
    }

    @param('did', Types.ObjectId)
    async postStar({ }, did: ObjectId) {
        await BlogModel.setStar(did, this.user._id, true);
        this.back({ star: true });
    }

    @param('did', Types.ObjectId)
    async postUnstar({ }, did: ObjectId) {
        await BlogModel.setStar(did, this.user._id, false);
        this.back({ star: false });
    }
}

class BlogEditHandler extends BlogHandler {
    async get() {
        this.response.template = 'blog_edit.html';
        this.response.body = { ddoc: this.ddoc };
    }

    @param('title', Types.Title)
    @param('content', Types.Content)
    async postCreate({ }, title: string, content: string) {
        await this.limitRate('add_blog', 3600, 60);
        const did = await BlogModel.add(this.user._id, title, content, this.request.ip);
        this.response.body = { did };
        this.response.redirect = this.url('blog_detail', { uid: this.user._id, did });
    }

    @param('did', Types.ObjectId)
    @param('title', Types.Title)
    @param('content', Types.Content)
    async postUpdate({ }, did: ObjectId, title: string, content: string) {
        if (!this.user.own(this.ddoc!)) this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        await Promise.all([
            BlogModel.edit(did, title, content),
            OplogModel.log(this, 'blog.edit', this.ddoc),
        ]);
        this.response.body = { did };
        this.response.redirect = this.url('blog_detail', { uid: this.user._id, did });
    }

    @param('did', Types.ObjectId)
    async postDelete({ }, did: ObjectId) {
        if (!this.user.own(this.ddoc!)) this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        await Promise.all([
            BlogModel.del(did),
            OplogModel.log(this, 'blog.delete', this.ddoc),
        ]);
        this.response.redirect = this.url('blog_main', { uid: this.ddoc!.owner });
    }
}

class BlogAdminListHandler extends Handler {
    @param('page', Types.PositiveInt, true)
    async get(domainId: string, page = 1) {
        const [ddocs, pcount] = await this.paginate(
            BlogModel.getMulti(),
            page,
            'blog',
        );
        const udocs = await UserModel.getList(domainId, ddocs.map((d) => d.owner));
        this.response.template = 'manage_blog.html';
        this.response.body = {
            ddocs, pcount, udocs, page,
        };
    }
}

export async function apply(ctx: Context) {
    ctx.setting.SystemSetting(
        SettingModel.Setting('setting_basic', 'pagination.blog', 20, 'number', 'pagination.blog', 'Blogs per page'),
    );
    ctx.Route('blog_main', '/blog/:uid', BlogUserHandler);
    ctx.Route('blog_create', '/blog/:uid/create', BlogEditHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('blog_detail', '/blog/:uid/:did', BlogDetailHandler);
    ctx.Route('blog_edit', '/blog/:uid/:did/edit', BlogEditHandler, PRIV.PRIV_USER_PROFILE);
    ctx.Route('manage_blog', '/manage/blog', BlogAdminListHandler, PRIV.PRIV_EDIT_SYSTEM);
    ctx.injectUI('UserDropdown', 'blog_main', (h) => ({ icon: 'book', displayName: 'Blog', uid: h.user._id.toString() }),
        PRIV.PRIV_USER_PROFILE);
    ctx.injectUI('ControlPanel', 'manage_blog', { icon: 'book' }, PRIV.PRIV_EDIT_SYSTEM);
    // Owner / Title / Edit reuse core translations; blog-specific labels are namespaced to avoid overriding core keys.
    ctx.i18n.load('zh', {
        "{0}'s blog": '{0} 的博客',
        Blog: '博客',
        blog_actions: '操作',
        blog_detail: '博客详情',
        blog_edit: '编辑博客',
        blog_id: '博客 ID',
        blog_main: '博客',
        blog_replies: '回复数',
        blog_updated: '更新时间',
        blog_views: '浏览量',
        manage_blog: '博客管理',
        'No blogs yet.': '暂无博客。',
        'Blogs per page': '每页展示的博客数量',
    });
    ctx.i18n.load('zh_TW', {
        "{0}'s blog": '{0} 的部落格',
        Blog: '部落格',
        blog_actions: '操作',
        blog_detail: '部落格詳情',
        blog_edit: '編輯部落格',
        blog_id: '部落格 ID',
        blog_main: '部落格',
        blog_replies: '回覆數',
        blog_updated: '更新時間',
        blog_views: '瀏覽量',
        manage_blog: '部落格管理',
        'No blogs yet.': '暫無部落格。',
        'Blogs per page': '每頁顯示的部落格數量',
    });
    ctx.i18n.load('ko', {
        "{0}'s blog": '{0}의 블로그',
        Blog: '블로그',
        blog_actions: '작업',
        blog_detail: '블로그 상세',
        blog_edit: '블로그 수정',
        blog_id: '블로그 ID',
        blog_main: '블로그',
        blog_replies: '댓글 수',
        blog_updated: '업데이트 시간',
        blog_views: '조회수',
        manage_blog: '블로그 관리',
        'No blogs yet.': '블로그가 없습니다.',
        'Blogs per page': '페이지당 블로그 수',
    });
    ctx.i18n.load('en', {
        blog_actions: 'Actions',
        blog_detail: 'Blog Detail',
        blog_edit: 'Edit Blog',
        blog_id: 'Blog ID',
        blog_main: 'Blog',
        blog_replies: 'Replies',
        blog_updated: 'Updated',
        blog_views: 'Views',
        manage_blog: 'Blog Management',
    });
}
