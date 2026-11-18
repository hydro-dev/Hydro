/* eslint-disable no-await-in-loop */
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type { ImagePreviewService } from '@hgnuoj/image-preview';
import { userFile, version } from '@hgnuoj/image-preview/images';
import type { Collection } from 'mongodb';
import sharp from 'sharp';
import {
    Context, db, FileInfo, Handler, nanoid, NotFoundError, ObjectId, PERM, PRIV,
    StorageModel, SystemModel, UserModel, ValidationError,
} from 'hydrooj';
import { Album, AWARD_LABELS, escapeSearch, fields, orderedPhotos, paginateYears, Photo } from './model';

declare module 'hydrooj' {
    interface Collections {
        'hgnu.album': Album;
    }
}

export const albums = db.collection('hgnu.album');
const fileAccounts = UserModel.coll as unknown as Collection<{ _id: number, _files?: FileInfo[] }>;
const stylesheet = readFileSync(join(__dirname, 'frontend/album.css'), 'utf8');
const styleVersion = createHash('sha256').update(stylesheet).digest('hex').slice(0, 16);

class AlbumStylesheetHandler extends Handler {
    noCheckPermView = true;

    get() {
        this.response.type = 'text/css';
        this.response.addHeader('Cache-Control', 'public, max-age=31536000, immutable');
        this.response.addHeader('ETag', `"${styleVersion}"`);
        this.response.body = stylesheet;
    }
}

async function images(ctx: Context, photos: Photo[]) {
    const paths = [...new Set(photos.map((photo) => userFile(photo.src)).filter(Boolean))];
    const rows = await StorageModel.coll.find({ path: { $in: paths }, autoDelete: null }).toArray();
    const sources = new Map(rows.map((row) => [row.path, row]));
    const service = ctx.get('image-preview') as ImagePreviewService;
    const result = [];
    for (const photo of photos) {
        const source = sources.get(userFile(photo.src));
        const info = source && service ? await service.previews.dimensions(source) : null;
        const url = (width: number) => info ? `${photo.src}/preview/${width}/${version(source)}.webp` : photo.src;
        result.push({
            ...photo, thumb: url(480), preview: url(1600),
            original: `${photo.src}?noDisposition=true`, width: info?.width || 4, height: info?.height || 3,
        });
    }
    return result;
}

function validate<T>(fn: () => T): T {
    try {
        return fn();
    } catch (e) {
        throw new ValidationError(e.message);
    }
}

class AlbumBaseHandler extends Handler {
    album?: Album;

    renderAlbum(template: string, body: Record<string, any>) {
        this.response.template = template;
        this.response.body = { ...body, awardLabels: AWARD_LABELS, albumStylesheet: this.url('album_style', { version: styleVersion }) };
    }

    async prepare() {
        const domainId = this.domain._id;
        const aid = this.request.params.aid;
        // Hydro merges request fields into args before loading domain permissions.
        if (this.args.domainId !== domainId || (this.args.aid && this.args.aid !== aid)) {
            throw new ValidationError('相册地址与请求参数不一致');
        }
        this.checkPerm(PERM.PERM_VIEW_DISCUSSION);
        if (!aid) return;
        if (!ObjectId.isValid(aid)) throw new NotFoundError('相册');
        this.album = await albums.findOne({ _id: new ObjectId(aid), domainId, deletedAt: null });
        if (!this.album || (!this.album.published && !this.canEdit())) throw new NotFoundError('相册');
    }

    canEdit() {
        return this.user.hasPriv(PRIV.PRIV_USER_PROFILE) && (this.user.hasPerm(PERM.PERM_EDIT_DISCUSSION)
            || (this.album?.owner === this.user._id && this.user.hasPerm(PERM.PERM_EDIT_DISCUSSION_SELF)));
    }

    checkEdit() {
        this.checkPriv(PRIV.PRIV_USER_PROFILE);
        if (!this.canEdit()) this.checkPerm(PERM.PERM_EDIT_DISCUSSION);
    }

    canDelete() {
        return this.canEdit() && (this.user.hasPerm(PERM.PERM_DELETE_DISCUSSION)
            || (this.album.owner === this.user._id && this.user.hasPerm(PERM.PERM_DELETE_DISCUSSION_SELF)));
    }

    revision(value: any) {
        if (!Number.isSafeInteger(+value) || +value !== this.album.revision) throw new ValidationError('相册已被更新，请刷新页面后再保存');
        return +value;
    }

    async replace(revision: number, value: Partial<Album>) {
        const result = await albums.findOneAndUpdate(
            { _id: this.album._id, domainId: this.album.domainId, revision, deletedAt: null },
            { $set: { ...value, updatedAt: new Date() }, $inc: { revision: 1 } },
            { returnDocument: 'after' },
        );
        if (!result) throw new ValidationError('相册已被更新，请刷新页面后再保存');
        return result;
    }
}

class AlbumMainHandler extends AlbumBaseHandler {
    async get({ q = '', year = '', page = 1 }) {
        const domainId = this.domain._id;
        const search = String(q).trim().slice(0, 100);
        const selectedYear = String(year);
        if (selectedYear && !/^(?:0|19\d\d|20\d\d|2100)$/.test(selectedYear)) throw new ValidationError('年份');
        const requestedPage = Math.max(1, Math.min(10000, Number(page) || 1));
        if (!Number.isInteger(requestedPage)) throw new ValidationError('页码');
        const visible = this.user.hasPerm(PERM.PERM_EDIT_DISCUSSION) ? {} : this.user.hasPriv(PRIV.PRIV_USER_PROFILE)
            ? { $or: [{ published: true }, { owner: this.user._id }] } : { published: true };
        const scope = { domainId, deletedAt: null, ...visible };
        const filter = {
            ...scope, ...selectedYear ? { year: +selectedYear } : {},
            ...search ? { title: new RegExp(escapeSearch(search), 'i') } : {},
        };
        const [stats, yearCounts, matchingYears] = await Promise.all([
            albums.aggregate([{ $match: scope }, { $group: { _id: null, count: { $sum: 1 }, photos: { $sum: { $size: '$photos' } } } }]).toArray(),
            albums.aggregate([{ $match: scope }, { $group: { _id: '$year', count: { $sum: 1 } } }, { $sort: { _id: -1 } }]).toArray(),
            albums.aggregate([{ $match: filter }, { $group: { _id: '$year', count: { $sum: 1 } } }, { $sort: { _id: -1 } }]).toArray(),
        ]);
        const pages = paginateYears(matchingYears.map((row) => ({ year: row._id, count: row.count })));
        const currentPage = Math.min(requestedPage, Math.max(1, pages.length));
        const total = matchingYears.reduce((sum, row) => sum + row.count, 0);
        const rows = await albums.find({ ...filter, year: { $in: pages[currentPage - 1] || [] } })
            .sort({ year: -1, date: -1, createdAt: -1, _id: -1 }).toArray();
        const coverPhotos = rows.map((album) => album.photos.find((photo) => photo.id === album.cover) || album.photos[0]);
        const covers = await images(this.ctx, coverPhotos.filter(Boolean));
        const groups: { year: number, items: any[] }[] = [];
        for (const album of rows) {
            if (!groups.length || groups.at(-1).year !== album.year) groups.push({ year: album.year, items: [] });
            const cover = album.photos.find((photo) => photo.id === album.cover) || album.photos[0];
            groups.at(-1).items.push({ ...album, coverImage: covers.find((photo) => photo.id === cover?.id) });
        }
        const pageUrl = (p: number, y = selectedYear) => `${this.url('album_main')}?${new URLSearchParams({ q: search, year: y, page: String(p) })}`;
        this.renderAlbum('album_main.html', {
            groups, years: yearCounts.map((row) => ({ year: row._id, count: row.count, url: pageUrl(1, String(row._id)) })),
            stats: stats[0] || { count: 0, photos: 0 }, total, q: search, year: selectedYear, page: currentPage,
            pageCount: pages.length, previous: pageUrl(currentPage - 1), next: pageUrl(currentPage + 1), allYears: pageUrl(1, ''),
            canCreate: this.user.hasPriv(PRIV.PRIV_USER_PROFILE) && this.user.hasPerm(PERM.PERM_CREATE_DISCUSSION),
        });
    }
}

class AlbumDetailHandler extends AlbumBaseHandler {
    async get() {
        const photos = await images(this.ctx, this.album.photos);
        this.renderAlbum('album_detail.html', { album: this.album, photos, canEdit: this.canEdit() });
    }
}

class AlbumCreateHandler extends AlbumBaseHandler {
    async get() {
        this.checkPriv(PRIV.PRIV_USER_PROFILE);
        this.checkPerm(PERM.PERM_CREATE_DISCUSSION);
        this.renderAlbum('album_edit.html', {
            album: { title: '', year: new Date().getFullYear(), date: '', description: '', published: false, photos: [], revision: 0 },
            photos: [], isNew: true,
        });
    }

    async post(args) {
        this.checkPriv(PRIV.PRIV_USER_PROFILE);
        this.checkPerm(PERM.PERM_CREATE_DISCUSSION);
        await this.limitRate('album_create', 3600, 30);
        const info = validate(() => fields(args));
        const now = new Date();
        const _id = new ObjectId();
        await albums.insertOne({
            _id, domainId: this.domain._id, owner: this.user._id, ...info,
            photos: [], cover: '', createdAt: now, updatedAt: now, revision: 0,
        });
        this.response.redirect = this.url('album_edit', { aid: _id });
        this.response.body = { id: _id.toHexString() };
    }
}

class AlbumEditHandler extends AlbumBaseHandler {
    async get() {
        this.checkEdit();
        this.renderAlbum('album_edit.html', {
            album: this.album, photos: await images(this.ctx, this.album.photos), isNew: false, canDelete: this.canDelete(),
        });
    }

    async post(args) {
        this.checkEdit();
        if (args.operation) return;
        const revision = this.revision(args.revision);
        const info = validate(() => fields(args));
        const photos = validate(() => orderedPhotos(JSON.parse(args.photos || '[]'), this.album.photos));
        const cover = photos.some((photo) => photo.id === args.cover) ? args.cover : photos[0]?.id || '';
        await this.replace(revision, { ...info, photos, cover });
        this.response.redirect = this.url('album_detail', { aid: this.album._id });
    }

    async postUpload(args) {
        this.checkEdit();
        this.checkPriv(PRIV.PRIV_CREATE_FILE);
        await this.limitRate('album_upload', 60, 60);
        const revision = this.revision(args.revision);
        if (this.album.photos.length >= 500) throw new ValidationError('一个相册最多 500 张照片');
        const file = this.request.files?.file;
        if (!file || Array.isArray(file) || file.size > 20 * 1024 * 1024 || file.size === 0) throw new ValidationError('请选择不超过 20 MB 的图片');
        const buffer = await readFile(file.filepath);
        const info = await sharp(buffer, { limitInputPixels: 80 * 1000 * 1000 }).metadata().catch(() => null);
        if (!info || !['jpeg', 'png', 'webp'].includes(info.format) || (info.pages || 1) > 1) {
            throw new ValidationError('支持 JPG、PNG 和静态 WebP 图片');
        }
        const owner = await UserModel.coll.findOne({ _id: this.user._id });
        const files = owner._files || [];
        if (!this.user.hasPriv(PRIV.PRIV_UNLIMITED_QUOTA) && (files.length >= SystemModel.get('limit.user_files')
            || files.reduce((sum, row) => sum + (row.size || 0), 0) + file.size > SystemModel.get('limit.user_files_size'))) {
            throw new ValidationError('文件空间或数量已达到上限');
        }
        const filename = `album-${this.album._id}-${nanoid(12)}.${info.format === 'jpeg' ? 'jpg' : info.format}`;
        const target = `user/${this.user._id}/${filename}`;
        const photo = { id: nanoid(16), src: `/file/${this.user._id}/${filename}`, caption: '' };
        try {
            await StorageModel.put(target, buffer, this.user._id);
            const meta = await StorageModel.getMeta(target);
            await fileAccounts.updateOne({ _id: this.user._id }, {
                $push: { _files: { _id: filename, name: filename, size: meta.size, etag: meta.etag, lastModified: meta.lastModified } },
            });
            UserModel._deleteUserCache(owner);
            const view = (await images(this.ctx, [photo]))[0];
            const result = await albums.findOneAndUpdate(
                { _id: this.album._id, domainId: this.album.domainId, revision, deletedAt: null },
                { $push: { photos: photo }, $set: { updatedAt: new Date(), ...this.album.cover ? {} : { cover: photo.id } }, $inc: { revision: 1 } },
                { returnDocument: 'after' },
            );
            if (!result) throw new ValidationError('相册已被更新，请刷新后重试上传');
            this.response.body = { photo: view, revision: result.revision };
        } catch (e) {
            await StorageModel.del([target], this.user._id);
            await fileAccounts.updateOne({ _id: this.user._id }, { $pull: { _files: { _id: filename } } });
            UserModel._deleteUserCache(owner);
            throw e;
        }
    }

    async postDelete(args) {
        this.checkEdit();
        const revision = this.revision(args.revision);
        if (!this.user.hasPerm(PERM.PERM_DELETE_DISCUSSION)) {
            if (this.album.owner !== this.user._id) this.checkPerm(PERM.PERM_DELETE_DISCUSSION);
            this.checkPerm(PERM.PERM_DELETE_DISCUSSION_SELF);
        }
        await this.replace(revision, { deletedAt: new Date() });
        this.response.redirect = this.url('album_main');
    }
}

export const inject = ['db', 'storage'];
export async function apply(ctx: Context) {
    await albums.createIndex({ domainId: 1, year: -1, date: -1, createdAt: -1 });
    await albums.createIndex({ domainId: 1, 'source.discussion': 1, 'source.section': 1 }, {
        unique: true, partialFilterExpression: { 'source.discussion': { $exists: true } },
    });
    ctx.Route('album_main', '/albums', AlbumMainHandler);
    ctx.Route('album_style', '/album-assets/:version/album.css', AlbumStylesheetHandler);
    ctx.Route('album_create', '/albums/new', AlbumCreateHandler);
    ctx.Route('album_edit', '/albums/:aid/edit', AlbumEditHandler);
    ctx.Route('album_detail', '/albums/:aid', AlbumDetailHandler);
    ctx.injectUI('Nav', 'album_main', { prefix: 'album', before: 'courses' }, PERM.PERM_VIEW_DISCUSSION);
    ctx.on('handler/after/DiscussionDetail', async (handler) => {
        if (await albums.findOne({ domainId: handler.domain._id, 'source.discussion': handler.ddoc.docId, published: true, deletedAt: null })) {
            handler.response.body.albumCollection = handler.url('album_main');
            handler.response.body.albumStylesheet = handler.url('album_style', { version: styleVersion });
        }
    });
}
