import assert from 'assert';
import crypto from 'crypto-js';
import { lt } from 'semver';
import {
    db, definePlugin, ForbiddenError, Handler, post, Types, yaml,
} from 'hydrooj';

function decrypt(encrypted: string) {
    return crypto.DES.decrypt(
        { ciphertext: crypto.enc.Hex.parse(encrypted) },
        crypto.enc.Utf8.parse('hydro-oj'),
        { mode: crypto.mode.ECB },
    ).toString(crypto.enc.Utf8);
}

declare module 'hydrooj' {
    interface Collections {
        dataReport: any;
    }
    interface EventMap {
        'center/report': (thisArg: DataReportHandler, installId: string, old: any, payload: any) => void;
    }
}

const coll = db.collection('dataReport');

class DataReportHandler extends Handler {
    noCheckPermView = true;
    category = '#center';

    @post('installId', Types.String)
    @post('payload', Types.String)
    async post(domainId: string, installId: string, _payload: string) {
        let payload: any;
        try {
            payload = yaml.load(decrypt(_payload));
        } catch (e) {
            payload = yaml.load(_payload);
        }
        try {
            assert(typeof payload.url === 'string');
        } catch (e) {
            console.log(payload);
            throw new ForbiddenError();
        }
        const old = await coll.findOne({ _id: installId });
        const setPayload: any = {
            version: payload.version,
            name: payload.name,
            url: payload.url,
            addons: payload.addons,
            mem: payload.memory,
            osinfo: payload.osinfo,
            cpu: payload.cpu,
            ip: this.request.ip,
            flags: payload.flags,
            update: new Date(),
            domainCount: payload.domainCount,
            userCount: payload.userCount,
            problemCount: payload.problemCount,
            discussionCount: payload.discussionCount,
            recordCount: payload.recordCount,
            sandbox: payload.sandbox,
            dbVersion: payload.dbVersion,
        };
        if (old?.notification) setPayload.notification = '';
        if (old && lt(payload.version, old.version)) {
            await coll.updateOne(
                { _id: installId },
                {
                    $addToSet: {
                        ips: this.request.ip,
                    },
                    $set: { downgrade: setPayload },
                },
            );
        } else {
            await coll.updateOne({ _id: installId }, {
                $addToSet: {
                    ips: this.request.ip,
                },
                $set: setPayload,
                $setOnInsert: { init: new Date() },
            }, { upsert: true });
        }
        this.ctx.emit('center/report', this, installId, old, payload);
        // TODO deliver messages
        this.response.body = { code: 0 };
        if (old?.notification) this.response.body.notification = old?.notification;
    }
}

export default definePlugin({
    apply(ctx) {
        ctx.Route('data_report', '/center/report', DataReportHandler);
    },
});
