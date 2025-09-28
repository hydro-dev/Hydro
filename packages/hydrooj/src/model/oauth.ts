import { Collection } from 'mongodb';
import { Context, Service } from '../context';
import type { Handler } from '../service/server';

export interface OauthMap {
    platform: string;
    /** source openId */
    id: string;
    /** target uid */
    uid: number;
}

declare module '../context' {
    interface Context {
        oauth: OauthModel;
    }
}

export interface OAuthUserResponse {
    _id: string;
    email: string;
    avatar?: string;
    bio?: string;
    uname?: string[];
    viewLang?: string;
    set?: Record<string, any>;
    setInDomain?: Record<string, any>;
}

export interface OAuthProvider {
    text: string;
    name: string;
    icon?: string;
    hidden?: boolean;
    get: (this: Handler) => Promise<void>;
    callback: (this: Handler, args: Record<string, any>) => Promise<OAuthUserResponse>;
    canRegister?: boolean;
    lockUsername?: boolean;
}

export default class OauthModel extends Service {
    static inject = ['db'];
    coll: Collection<OauthMap>;
    providers: Record<string, OAuthProvider> = Object.create(null);

    constructor(ctx: Context) {
        super(ctx, 'oauth');
        this.coll = ctx.db.collection('oauth');
    }

    async [Context.init]() {
        await this.ctx.db.ensureIndexes(this.coll,
            { key: { platform: 1, id: 1 }, name: 'platform_id', unique: true },
            { key: { uid: 1, platform: 1 }, name: 'uid_platform' },
        );
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

    async unbind(platform: string, uid: number) {
        await this.coll.deleteOne({ platform, uid });
    }

    async list(uid: number) {
        return this.coll.find({ uid }).toArray();
    }

    async provide(name: string, provider: OAuthProvider) {
        if (this.providers[name]) throw new Error(`OAuth provider ${name} already exists`);
        this.ctx.effect(() => {
            this.providers[name] = provider;
            return () => {
                delete this.providers[name];
            };
        });
    }
}
