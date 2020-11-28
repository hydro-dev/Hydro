/* eslint-disable camelcase */
import fs from 'fs';
import { ObjectID } from 'mongodb';
import { PRIV } from '../model/builtin';
import * as system from '../model/system';
import * as file from '../model/file';
import * as user from '../model/user';
import * as db from '../service/db';
import {
    Route, Handler, Types, param,
} from '../service/server';
import { BadRequestError } from '../error';

const coll = db.collection('status');

class FileDownloadHandler extends Handler {
    @param('fileId', Types.ObjectID)
    @param('secret', Types.String)
    @param('name', Types.String, true)
    async get(domainId: string, fileId: ObjectID, secret: string, name: string) {
        if (name) name = Buffer.from(name, 'base64').toString();
        const doc = await file.getWithSecret(fileId, secret);
        this.response.attachment(name || fileId.toHexString(), doc);
    }
}

class FileUploadHandler extends Handler {
    async getQuota() {
        let quota = system.get('user.quota');
        if (this.user.hasPriv(PRIV.PRIV_UNLIMITED_QUOTA)) {
            quota = 2 ** 63 - 1;
        }
        return quota;
    }

    async get() {
        this.response.template = 'fs_upload.html';
        this.response.body = { fdoc: null, usage: this.user.usage, quota: await this.getQuota() };
    }

    @param('title', Types.String)
    @param('redirect', Types.String, true)
    async post(domainId: string, title: string, redirect?: string) {
        if (!this.request.files.file) throw new BadRequestError();
        const quota = await this.getQuota();
        const lfdoc = await fs.promises.stat(this.request.files.file.path);
        let ufid: ObjectID;
        const udoc = await user.inc(this.user._id, 'usage', lfdoc.size);
        try {
            ufid = await file.add(this.request.files.file.path, title, this.user._id);
        } catch (e) {
            await user.inc(this.user._id, 'usage', -lfdoc.size);
            throw e;
        }
        const fdoc = await file.getMeta(ufid);
        this.response.template = 'fs_upload.html';
        if (redirect) {
            this.response.redirect = redirect.includes('?')
                ? `${redirect}&ufid=${ufid}`
                : `${redirect}?ufid=${ufid}`;
        }
        this.response.body = {
            fdoc, ufid, usage: udoc.usage, quota,
        };
    }
}

class StatusHandler extends Handler {
    async get() {
        const stats = await coll.find().sort({ type: 1, updateAt: -1 }).toArray();
        for (const i in stats) {
            let desc = '';
            const online = new Date(stats[i].updateAt).getTime() > new Date().getTime() - 300000;
            if (!online) desc = 'Offline';
            desc = desc || 'Online';
            stats[i].isOnline = online;
            stats[i].status = desc;
        }
        const path = [
            ['Hydro', 'homepage'],
            ['status', null],
        ];
        this.response.body = { stats, path };
        this.response.template = 'status.html';
    }
}

class StatusUpdateHandler extends Handler {
    async post(args) {
        this.checkPriv(PRIV.PRIV_JUDGE);
        args.type = 'judger';
        return coll.updateOne(
            { mid: args.mid, type: 'judger' },
            { $set: args },
            { upsert: true },
        );
    }
}

class CheckInHandler extends Handler {
    async prepare() {
        const { checkincnt, lastcheckin } = this.user;
        const today = new Date();
        today.setHours(0);
        today.setMinutes(0);
        today.setSeconds(0);
        today.setMilliseconds(0);
        if (lastcheckin === today.getTime()) throw new BadRequestError("You've already checked in today!");
        this.user.checkincnt++;
        this.user.lastcheckin = today.getTime();
        await Promise.all([
            user.setById(this.user._id, { checkincnt, lastcheckin }),
            user.inc(this.user._id, 'rpdelta', Math.round(Math.sqrt(checkincnt))),
        ]);
    }

    async get() {
        this.response.redirect = '/';
    }

    async post() {
        this.response.body = {
            cnt: this.user.checkincnt,
            last: this.user.lastcheckin,
        };
    }
}

class SwitchLanguageHandler extends Handler {
    @param('lang', Types.String)
    async get(domainId: string, lang: string) {
        if (this.user.hasPriv(PRIV.PRIV_USER_PROFILE)) {
            this.session.viewLang = lang;
            await user.setById(this.user._id, { viewLang: lang });
        } else this.session.viewLang = lang;
        this.back();
    }
}

export async function apply() {
    Route('file_download', '/fs/:fileId/:secret', FileDownloadHandler);
    Route('file_download_with_name', '/fs/:fileId/:name/:secret', FileDownloadHandler);
    Route('file_upload', '/fs/upload', FileUploadHandler, PRIV.PRIV_CREATE_FILE);
    Route('status', '/status', StatusHandler);
    Route('status_update', '/status/update', StatusUpdateHandler);
    Route('check_in', '/checkin', CheckInHandler, PRIV.PRIV_USER_PROFILE);
    Route('switch_language', '/language/:lang', SwitchLanguageHandler);
}

global.Hydro.handler.misc = apply;
