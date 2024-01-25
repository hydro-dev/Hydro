import db from '../service/db';

const coll = db.collection('oauth');

class OauthModel {
    static async get(_id: string, platform: string) {
        const doc = await coll.findOne({ _id });
        if (doc && doc.platform === platform) return doc.uid;
        return null;
    }

    static async set(_id: string, uid: number, platform: string) {
        const res = await coll.findOneAndUpdate(
            { _id },
            { $set: { uid } },
            { platform },
            { upsert: true, returnDocument: 'after' },
        );
        return res.value?.uid;
    }
}

export default OauthModel;
global.Hydro.model.oauth = OauthModel;
