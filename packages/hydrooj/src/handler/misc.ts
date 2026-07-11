import { writeHeapSnapshot } from 'v8';
import { pick } from 'lodash';
import { lookup } from 'mime-types';
import { Context } from '../context';
import {
    AccessDeniedError, FileExistsError, FileLimitExceededError, FileUploadError, NotFoundError,
    ValidationError,
} from '../error';
import { PRIV } from '../model/builtin';
import * as oplog from '../model/oplog';
import storage from '../model/storage';
import system from '../model/system';
import user, { User } from '../model/user';
import {
    Handler, param, post, requireSudo, Types,
} from '../service/server';
import { encodeRFC5987ValueChars } from '../service/storage';
import { sortFiles } from '../utils';

class SwitchLanguageHandler extends Handler {
    noCheckPermView = true;

    @param('lang', Types.Name)
    async get(domainId: string, lang: string) {
        if (this.user.hasPriv(PRIV.PRIV_USER_PROFILE)) {
            this.session.viewLang = lang;
            await user.setById(this.user._id, { viewLang: lang });
        } else this.session.viewLang = lang;
        this.back();
    }
}

export class FilesHandler extends Handler {
    noCheckPermView = true;
    udoc: User;

    @param('uid', Types.Int, true)
    async prepare({ domainId }, uid: number) {
        if (uid) {
            this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
            this.udoc = await (await user.getById(domainId, uid)).private();
        } else {
            this.udoc = this.user;
        }
    }

    async get({ }) {
        if (!this.udoc._files?.length) this.checkPriv(PRIV.PRIV_CREATE_FILE);
        this.response.body = {
            files: sortFiles(this.udoc._files),
            urlForFile: (filename: string) => this.url('fs_download', { uid: this.udoc._id, filename }),
        };
        this.response.pjax = 'partials/files.html';
        this.response.template = 'home_files.html';
    }

    @post('filename', Types.Filename)
    async postUploadFile({ }, filename: string) {
        this.checkPriv(PRIV.PRIV_CREATE_FILE);
        if ((this.user._files?.length || 0) >= system.get('limit.user_files')) {
            if (!this.user.hasPriv(PRIV.PRIV_UNLIMITED_QUOTA)) throw new FileLimitExceededError('count');
        }
        const file = this.request.files?.file;
        if (!file) throw new ValidationError('file');
        const size = Math.sum((this.user._files || []).map((i) => i.size)) + file.size;
        if (size >= system.get('limit.user_files_size')) {
            if (!this.user.hasPriv(PRIV.PRIV_UNLIMITED_QUOTA)) throw new FileLimitExceededError('size');
        }
        if (this.user._files.find((i) => i.name === filename)) throw new FileExistsError(filename);
        await storage.put(`user/${this.user._id}/${filename}`, file.filepath, this.user._id);
        const meta = await storage.getMeta(`user/${this.user._id}/${filename}`);
        const payload = { name: filename, ...pick(meta, ['size', 'lastModified', 'etag']) };
        if (!meta) throw new FileUploadError();
        this.user._files.push({ _id: filename, ...payload });
        await user.setById(this.user._id, { _files: this.user._files });
        this.back();
    }

    @post('files', Types.ArrayOf(Types.Filename))
    async postDeleteFiles({ }, files: string[]) {
        await Promise.all([
            storage.del(files.map((t) => `user/${this.udoc._id}/${t}`), this.user._id),
            user.setById(this.udoc._id, { _files: this.udoc._files.filter((i) => !files.includes(i.name)) }),
        ]);
        this.back();
    }
}

export class FSDownloadHandler extends Handler {
    noCheckPermView = true;

    @param('uid', Types.Int)
    @param('filename', Types.Filename)
    @param('noDisposition', Types.Boolean)
    async get(domainId: string, uid: number, filename: string, noDisposition = false) {
        const target = `user/${uid}/${filename}`;
        const file = await storage.getMeta(target);
        await oplog.log(this, 'download.file.user', {
            target,
            size: file?.size || 0,
        });
        try {
            this.response.redirect = await storage.signDownloadLink(
                target, noDisposition ? undefined : filename, false, 'user',
            );
            this.response.addHeader('Cache-Control', 'public');
        } catch (e) {
            if (e.message.includes('Invalid path')) throw new NotFoundError(filename);
            throw e;
        }
    }
}

export class StorageHandler extends Handler {
    noCheckPermView = true;
    notUsage = true;

    @param('target', Types.Name)
    @param('filename', Types.Filename, true)
    @param('expire', Types.UnsignedInt)
    @param('secret', Types.String)
    async get({ }, target: string, filename = '', expire: number, secret: string) {
        if (expire < Date.now()) throw new AccessDeniedError();
        if (!(await this.ctx.get('storage')?.isLinkValid?.(`${target}/${expire}/${secret}`))) throw new AccessDeniedError();
        this.response.body = await storage.get(target);
        this.response.type = (target.endsWith('.out') || target.endsWith('.ans'))
            ? 'text/plain'
            : lookup(target) || 'application/octet-stream';
        if (filename) this.response.disposition = `attachment; filename="${encodeRFC5987ValueChars(filename)}"`;
    }
}

export class SwitchAccountHandler extends Handler {
    @requireSudo
    @param('uid', Types.Int)
    async get({ }, uid: number) {
        this.session.sudoUid = this.user._id;
        this.session.uid = uid;
        this.back();
    }
}

class HeapSnapshotHandler extends Handler {
    @param('worker', Types.Int)
    async post({ }, worker: number) {
        this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
        if (worker && process.env.NODE_APP_INSTANCE !== worker.toString()) {
            this.response.body = { error: 'Not current worker' };
            return;
        }
        this.response.body = {
            worker: process.env.NODE_APP_INSTANCE,
            filename: writeHeapSnapshot(),
        };
    }
}

export async function apply(ctx: Context) {
    ctx.Route('switch_language', '/language/:lang', SwitchLanguageHandler);
    ctx.Route('home_files', '/file', FilesHandler);
    ctx.Route('fs_download', '/file/:uid/:filename', FSDownloadHandler);
    ctx.Route('storage', '/storage', StorageHandler);
    ctx.Route('switch_account', '/account/:uid', SwitchAccountHandler, PRIV.PRIV_EDIT_SYSTEM);
    if (process.argv.includes('--enable-heap-snapshot')) {
        ctx.Route('heap_snapshot', '/heap-snapshot', HeapSnapshotHandler, PRIV.PRIV_EDIT_SYSTEM);
    }
}
