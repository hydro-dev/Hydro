import { omit } from 'lodash';
import { Filter, ObjectId } from 'mongodb';
import { BlogDoc } from '../interface';
import { NumberKeys } from '../typeutils';
import * as document from './document';

export async function add(
    owner: number, title: string, content: string,
    ip: string | null = null,
): Promise<ObjectId> {
    const payload: Partial<BlogDoc> = {
        content,
        owner,
        title,
        ip,
        nReply: 0,
        updateAt: new Date(),
        views: 0,
    };
    const res = await document.add(
        'system', payload.content!, payload.owner!, document.TYPE_BLOG,
        null, null, null, omit(payload, ['domainId', 'content', 'owner']),
    );
    payload.docId = res;
    return payload.docId;
}

export async function get(did: ObjectId): Promise<BlogDoc> {
    return await document.get('system', document.TYPE_BLOG, did);
}

export function edit(did: ObjectId, title: string, content: string): Promise<BlogDoc> {
    const payload = { title, content };
    return document.set('system', document.TYPE_BLOG, did, payload);
}

export function inc(did: ObjectId, key: NumberKeys<BlogDoc>, value: number): Promise<BlogDoc | null> {
    return document.inc('system', document.TYPE_BLOG, did, key, value);
}

export function del(did: ObjectId): Promise<never> {
    return Promise.all([
        document.deleteOne('system', document.TYPE_BLOG, did),
        document.deleteMultiStatus('system', document.TYPE_BLOG, { docId: did }),
    ]) as any;
}

export function count(query: Filter<BlogDoc>) {
    return document.count('system', document.TYPE_BLOG, query);
}

export function getMulti(query: Filter<BlogDoc> = {}) {
    return document.getMulti('system', document.TYPE_BLOG, query)
        .sort({ _id: -1 });
}

export async function addReply(did: ObjectId, owner: number, content: string, ip: string): Promise<ObjectId> {
    const [[, drid]] = await Promise.all([
        document.push('system', document.TYPE_BLOG, did, 'reply', content, owner, { ip }),
        document.incAndSet('system', document.TYPE_BLOG, did, 'nReply', 1, { updateAt: new Date() }),
    ]);
    return drid;
}

export function setStar(did: ObjectId, uid: number, star: boolean) {
    return document.setStatus('system', document.TYPE_BLOG, did, uid, { star });
}

export function getStatus(did: ObjectId, uid: number) {
    return document.getStatus('system', document.TYPE_BLOG, did, uid);
}

export function setStatus(did: ObjectId, uid: number, $set) {
    return document.setStatus('system', document.TYPE_BLOG, did, uid, $set);
}

global.Hydro.model.blog = {
    add,
    get,
    inc,
    edit,
    del,
    count,
    getMulti,
    addReply,
    setStar,
    getStatus,
    setStatus,
};
