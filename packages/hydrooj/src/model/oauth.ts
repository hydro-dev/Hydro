import db from '../service/db';

const coll = db.collection('oauth');

/**
    This is for compatibility with old Hydro OAuth modules
    Old versions of Hydro may not save platform names
    It is recommended that all plugin writers register platform information, as compatibility is reserved here.
*/
class OauthModel {
    static async get(_id: string, platform?: string) {
        const doc = await coll.findOne({ _id });
        if (doc && (doc.platform === platform || !doc.platform)) return doc.uid;
        return null;
    }

    static async set(_id: string, uid: number, platform?: string) {
        const res = await coll.findOneAndUpdate(
            { _id },
            { $set: { uid, platform } },
            { upsert: true, returnDocument: 'after' },
        );
        return res.value?.uid;
    }
}

export default OauthModel;
global.Hydro.model.oauth = OauthModel;
