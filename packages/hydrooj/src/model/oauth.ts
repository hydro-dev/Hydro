import { Collection } from 'mongodb';
import { Context, Service } from '../context';

export interface OauthMap {
    platform: string;
    /** source openId */
    id: string;
    /** target uid */
    uid: number;
}

export default class OauthModel extends Service {
    static inject = ['db'];
    coll: Collection<OauthMap>;

    constructor(ctx: Context) {
        super(ctx, 'oauth');
        this.coll = ctx.db.collection('oauth');
    }

    async [Context.init]() {
        await this.ctx.db.ensureIndexes(this.coll,
            // { key: { platform: 1, id: 1 }, name: 'platform_id', unique: true },
            { key: { uid: 1, platform: 1 }, name: 'uid_platform' },
        );
        console.log('oauth init');
    }

    async get(platform: string, id: string) {
        const doc = await this.coll.findOne({ platform, id });
        if (doc) return doc.uid;
        return null;
    }

    async set(platform: string, id: string, uid: number) {
        const res = await this.coll.findOneAndUpdate(
            { platform, id },
            { $set: { uid } },
            { upsert: true, returnDocument: 'after' },
        );
        return res?.uid;
    }

    async unbind(platform: string, id: string, uid: number) {
        await this.coll.deleteOne({ platform, id, uid });
    }

    async list(uid: number) {
        return this.coll.find({ uid }).toArray();
    }
}
