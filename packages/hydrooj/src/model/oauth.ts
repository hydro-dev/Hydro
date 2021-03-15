import Lru from 'lru-cache';
import { Collection } from 'mongodb';
import db from '../service/db';

interface OauthMap {
    _id: string, // source openId
    uid: number, // target uid
}

const coll: Collection<OauthMap> = db.collection('oauth');
const cache = new Lru({
    maxAge: 5000,
});

class OauthModel {
    static async get(_id: string) {
        const res = cache.get(_id);
        if (res !== undefined) return res;
        const doc = await coll.findOne({ _id });
        if (doc) return doc.uid;
        return null;
    }

    static async set(_id: string, value: number) {
        cache.set(_id, value);
        const res = await coll.findOneAndUpdate(
            { _id },
            { $set: { value } },
            { upsert: true, returnOriginal: false },
        );
        return res.value.uid;
    }
}

export = OauthModel;
global.Hydro.model.oauth = OauthModel;
