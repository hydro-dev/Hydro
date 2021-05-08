import db from 'hydrooj/dist/service/db';
import {
    Handler, param, post, Route, Types,
} from 'hydrooj/dist/service/server';
import { RemoteOnlineJudgeError } from 'hydrooj/dist/error';
import crypto from 'crypto';
import yaml from 'js-yaml';
import superagent from 'superagent';

function decrypt(encrypted: string) {
    if (!encrypted) throw new Error();
    const decipher = crypto.createDecipheriv('des-ecb', 'hydro-oj', '');
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

declare module 'hydrooj/dist/interface' {
    interface Collections {
        dataReport: any;
    }
}

const coll = db.collection('dataReport');

class DataReportHandler extends Handler {
    noCheckPermView = true;

    @post('instanceId', Types.String)
    @post('payload', Types.String)
    async post(domainId: string, instanceId: string, _payload: string) {
        const payload: any = yaml.load(decrypt(_payload));
        await coll.updateOne({ _id: instanceId }, {
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

class ProxySendRequestHandler extends Handler {
    @param('endpoint', Types.String)
    @param('domainId', Types.String)
    @param('url', Types.String)
    @param('tokenId', Types.String)
    @param('expire', Types.UnsignedInt)
    async post(_d: string, endpoint: string, domainId: string, url: string, tokenId: string, expire: number) {
        let res = await superagent.post(`${url}d/${domainId}/problem/send`)
            .send({ operation: 'info', token: tokenId })
            .catch((e) => e);
        if (res instanceof Error) throw new RemoteOnlineJudgeError(res.message);
        res = await superagent.post(`${endpoint}/problem/receive`).send({
            operation: 'request', url: `${url}d/${domainId}/problem/send`, tokenId, expire,
        }).catch((e) => e);
        if (res instanceof Error) throw new RemoteOnlineJudgeError(res.message);
        this.response.body = { code: 0 };
    }
}

export function apply() {
    Route('data_report', '/center/report', DataReportHandler);
    Route('proxy_send', '/center/send', ProxySendRequestHandler);
}

global.Hydro.handler.center = apply;
