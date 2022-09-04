import db from '../service/db';

const coll = db.collection('oauth');

class OauthModel {
    static async get(_id: string) {
        const doc = await coll.findOne({ _id });
        if (doc) return doc.uid;
        return null;
    }

    static async set(_id: string, uid: number) {
        const res = await coll.findOneAndUpdate(
            { _id },
            { $set: { uid } },
            { upsert: true, returnDocument: 'after' },
        );
        return res.value?.uid;
    }
}

export default OauthModel;
global.Hydro.model.oauth = OauthModel;
