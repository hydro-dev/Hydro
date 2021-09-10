import crypto from 'crypto';
import yaml from 'js-yaml';
import db from 'hydrooj/src/service/db';
import {
    Handler, post, Route, Types,
} from 'hydrooj/src/service/server';

function decrypt(encrypted: string) {
    if (!encrypted) throw new Error();
    const decipher = crypto.createDecipheriv('des-ecb', 'hydro-oj', '');
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

declare module 'hydrooj/src/interface' {
    interface Collections {
        dataReport: any;
    }
}

const coll = db.collection('dataReport');

class DataReportHandler extends Handler {
    noCheckPermView = true;

    @post('installId', Types.String)
    @post('payload', Types.String)
    async post(domainId: string, installId: string, _payload: string) {
        const payload: any = yaml.load(decrypt(_payload));
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
            },
        }, { upsert: true });
        this.response.body = 'success';
    }
}

export function apply() {
    Route('data_report', '/center/report', DataReportHandler);
}

global.Hydro.handler.center = apply;
