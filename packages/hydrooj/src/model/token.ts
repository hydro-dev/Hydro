import { FilterQuery } from 'mongodb';
import { TokenDoc } from '../interface';
import * as bus from '../service/bus';
import db from '../service/db';
import { ArgMethod } from '../utils';

class TokenModel {
    static coll = db.collection('token');
    static TYPE_SESSION = 0;
    static TYPE_REGISTRATION = 2;
    static TYPE_CHANGEMAIL = 3;
    static TYPE_OAUTH = 4;
    static TYPE_LOSTPASS = 5;
    static TYPE_EXPORT = 6;
    static TYPE_IMPORT = 7;

    static async add(
        tokenType: number, expireSeconds: number, data: any, id = String.random(32),
    ): Promise<[string, TokenDoc]> {
        const now = new Date();
        const res = await TokenModel.coll.insertOne({
            ...data,
            _id: id,
            tokenType,
            createAt: now,
            updateAt: now,
            expireAt: new Date(now.getTime() + expireSeconds * 1000),
        });
        return [id, res.ops[0]];
    }

    @ArgMethod
    static async get(tokenId: string, tokenType: number): Promise<TokenDoc | null> {
        return await TokenModel.coll.findOne({ _id: tokenId, tokenType });
    }

    static getMulti(tokenType: number, query: FilterQuery<TokenDoc> = {}) {
        return TokenModel.coll.find({ tokenType, ...query });
    }

    static async update(
        tokenId: string, tokenType: number, expireSeconds: number,
        data: object,
    ) {
        const now = new Date();
        const res = await TokenModel.coll.findOneAndUpdate(
            { _id: tokenId, tokenType },
            {
                $set: {
                    ...data,
                    updateAt: now,
                    expireAt: new Date(now.getTime() + expireSeconds * 1000),
                    tokenType,
                },
            },
            { returnDocument: 'after' },
        );
        return res.value;
    }

    @ArgMethod
    static async del(tokenId: string, tokenType: number) {
        const result = await TokenModel.coll.deleteOne({ _id: tokenId, tokenType });
        return !!result.deletedCount;
    }

    static async createOrUpdate(
        tokenType: number, expireSeconds: number, data: any,
    ): Promise<string> {
        const d = await TokenModel.coll.findOne({ tokenType, ...data });
        if (!d) {
            const res = await TokenModel.add(tokenType, expireSeconds, data);
            return res[0];
        }
        await TokenModel.update(d._id, tokenType, expireSeconds, data);
        return d._id;
    }

    @ArgMethod
    static getSessionListByUid(uid: number) {
        return TokenModel.coll.find({ uid, tokenType: TokenModel.TYPE_SESSION }).sort('updateAt', -1).limit(100).toArray();
    }

    @ArgMethod
    static async getMostRecentSessionByUid(uid: number) {
        return await TokenModel.coll.findOne({ uid, tokenType: TokenModel.TYPE_SESSION }, { sort: { updateAt: -1 } });
    }

    @ArgMethod
    static delByUid(uid: number) {
        return TokenModel.coll.deleteMany({ uid });
    }
}

bus.once('app/started', () => db.ensureIndexes(
    TokenModel.coll,
    { key: { uid: 1, tokenType: 1, updateAt: -1 }, name: 'basic', sparse: true },
    { key: { expireAt: -1 }, name: 'expire', expireAfterSeconds: 0 },
));
export default TokenModel;
global.Hydro.model.token = TokenModel;
