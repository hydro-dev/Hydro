import assert from 'assert';
import crypto from 'crypto';
import {
    Context, db, ForbiddenError, Handler, post, Types, yaml,
} from 'hydrooj';

function decrypt(encrypted: string) {
    if (!encrypted) throw new Error();
    const decipher = crypto.createDecipheriv('des-ecb', 'hydro-oj', '');
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
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
            throw new ForbiddenError();
        }
        const old = await coll.findOne({ _id: installId });
        await coll.updateOne({ _id: installId }, {
            $set: {
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
            },
        }, { upsert: true });
        bus.emit('center/report', this, installId, old, payload);
        this.response.body = { code: 0 };
    }
}

export function apply(ctx: Context) {
    ctx.Route('data_report', '/center/report', DataReportHandler);
}
