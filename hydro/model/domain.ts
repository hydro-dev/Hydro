import * as builtin from './builtin';
import * as document from './document';
import * as db from '../service/db';
import * as validator from '../lib/validator';

const coll = db.collection('domain');

export function add(domainId: string, owner: number, name: string, isEnsure = false) {
    const tasks = [];
    if (isEnsure) {
        tasks.push(
            coll.updateOne(
                { _id: domainId },
                { $set: { owner }, $setOnInsert: { name, bulletin: '' } },
                { upsert: true },
            ),
        );
    } else {
        tasks.push(
            coll.insertOne({
                _id: domainId, owner, name, bulletin: '',
            }),
        );
    }
    for (const id in builtin.BUILTIN_ROLES) {
        tasks.push(
            document.add(
                domainId, builtin.BUILTIN_ROLES[id].perm, owner,
                document.TYPE_DOMAIN_USER, id,
            ),
        );
    }
    return Promise.all(tasks);
}

export async function get(domainId: string) {
    return coll.findOne({ _id: domainId });
}

export function getMany(query: any, sort: any, page: number, limit: number) {
    return coll.find(query).sort(sort).skip((page - 1) * limit).limit(limit)
        .toArray();
}

export function getMulti(query: any = {}) {
    return coll.find(query);
}

export function edit(domainId: string, $set: any) {
    if ($set.title) validator.checkTitle($set.title);
    if ($set.content) validator.checkContent($set.content);
    return coll.updateOne({ _id: domainId }, { $set });
}

export async function inc(domainId: string, field: string, n: number) {
    const res = await coll.findOneAndUpdate(
        { _id: domainId },
        { $inc: { [field]: n } },
        { returnOriginal: false },
    );
    return res.value;
}

export async function getList(domainIds: string[]) {
    const r = {};
    // eslint-disable-next-line no-await-in-loop
    for (const domainId of domainIds) r[domainId] = await get(domainId);
    return r;
}

global.Hydro.model.domain = {
    add,
    inc,
    get,
    getMany,
    edit,
    getMulti,
    getList,
};
