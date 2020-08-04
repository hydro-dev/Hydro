import { TokenDoc } from '../interface';
import * as db from '../service/db';

const coll = db.collection('token');

export const TYPE_SESSION = 0;
export const TYPE_REGISTRATION = 2;
export const TYPE_CHANGEMAIL = 3;
export const TYPE_OAUTH = 4;
export const TYPE_LOSTPASS = 5;

function ensureIndexes() {
    return Promise.all([
        coll.createIndex([{ uid: 1 }, { tokenType: 1 }, { updateAt: -1 }], { sparse: true }),
        coll.createIndex('expireAt', { expireAfterSeconds: 0 }),
    ]);
}

export async function add(
    tokenType: number, expireSeconds: number, data: any,
): Promise<[string, TokenDoc]> {
    const now = new Date();
    const str = String.random(32);
    const res = await coll.insertOne({
        ...data,
        _id: str,
        tokenType,
        createAt: now,
        updateAt: now,
        expireAt: new Date(now.getTime() + expireSeconds * 1000),
    });
    return [str, res.ops[0]];
}

export async function get(tokenId: string, tokenType: number): Promise<TokenDoc | null> {
    return await coll.findOne({ _id: tokenId, tokenType });
}

export async function update(
    tokenId: string, tokenType: number, expireSeconds: number,
    data: object,
) {
    const now = new Date();
    const res = await coll.findOneAndUpdate(
        { _id: tokenId, tokenType },
        {
            $set: {
                ...data,
                updateAt: now,
                expireAt: new Date(now.getTime() + expireSeconds * 1000),
                tokenType,
            },
        },
        { returnOriginal: false },
    );
    return res.value;
}

export async function del(tokenId: string, tokenType: number) {
    const result = await coll.deleteOne({ _id: tokenId, tokenType });
    return !!result.deletedCount;
}

export async function createOrUpdate(
    tokenType: number, expireSeconds: number, data: any,
): Promise<string> {
    const d = await coll.findOne({ tokenType, ...data });
    if (!d) {
        const res = await add(tokenType, expireSeconds, data);
        return res[0];
    }
    await update(d._id, tokenType, expireSeconds, data);
    return d._id;
}

export function getSessionListByUid(uid: number) {
    return coll.find({ uid, tokenType: TYPE_SESSION }).sort('updateAt', -1).toArray();
}

export function getMostRecentSessionByUid(uid: number) {
    return coll.findOne({ uid, tokenType: TYPE_SESSION }, { sort: { updateAt: -1 } });
}

export function delByUid(uid: number) {
    return coll.deleteMany({ uid });
}

global.Hydro.postInit.push(ensureIndexes);
global.Hydro.model.token = {
    TYPE_SESSION,
    TYPE_CHANGEMAIL,
    TYPE_OAUTH,
    TYPE_REGISTRATION,
    TYPE_LOSTPASS,

    add,
    createOrUpdate,
    get,
    update,
    del,
    delByUid,
    getMostRecentSessionByUid,
    getSessionListByUid,
};
