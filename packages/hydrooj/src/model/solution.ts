import { ObjectId } from 'mongodb';
import { SolutionNotFoundError } from '../error';
import bus from '../service/bus';
import * as document from './document';

class SolutionModel {
    static add(domainId: string, pid: number, owner: number, content: string) {
        return document.add(
            domainId, content, owner, document.TYPE_PROBLEM_SOLUTION,
            null, document.TYPE_PROBLEM, pid, { reply: [], vote: 0 },
        );
    }

    static async get(domainId: string, psid: ObjectId) {
        const psdoc = await document.get(domainId, document.TYPE_PROBLEM_SOLUTION, psid);
        if (!psdoc) throw new SolutionNotFoundError(domainId, psid);
        return psdoc;
    }

    static getMany(domainId: string, query: any, sort: any, page: number, limit: number) {
        return document.getMulti(domainId, document.TYPE_PROBLEM_SOLUTION, query)
            .sort(sort)
            .skip((page - 1) * limit).limit(limit)
            .toArray();
    }

    static edit(domainId: string, psid: ObjectId, content: string) {
        return document.set(domainId, document.TYPE_PROBLEM_SOLUTION, psid, { content });
    }

    static async del(domainId: string, psid: ObjectId) {
        return await Promise.all([
            document.deleteOne(domainId, document.TYPE_PROBLEM_SOLUTION, psid),
            document.deleteMultiStatus(domainId, document.TYPE_PROBLEM_SOLUTION, { docId: psid }),
        ]);
    }

    static count(domainId: string, query: any) {
        return document.count(domainId, document.TYPE_PROBLEM_SOLUTION, query);
    }

    static getMulti(domainId: string, pid: number, query: any = {}) {
        return document.getMulti(
            domainId, document.TYPE_PROBLEM_SOLUTION,
            { parentType: document.TYPE_PROBLEM, parentId: pid, ...query },
        ).sort({ vote: -1 });
    }

    static getByUser(domainId: string, uid: number) {
        return document.getMulti(
            domainId, document.TYPE_PROBLEM_SOLUTION,
            { parentType: document.TYPE_PROBLEM, owner: uid },
        ).sort({ _id: -1 });
    }

    static reply(domainId: string, psid: ObjectId, owner: number, content: string) {
        return document.push(domainId, document.TYPE_PROBLEM_SOLUTION, psid, 'reply', content, owner);
    }

    static getReply(domainId: string, psid: ObjectId, psrid: ObjectId) {
        return document.getSub(domainId, document.TYPE_PROBLEM_SOLUTION, psid, 'reply', psrid);
    }

    static editReply(domainId: string, psid: ObjectId, psrid: ObjectId, content: string) {
        return document.setSub(domainId, document.TYPE_PROBLEM_SOLUTION, psid, 'reply', psrid, { content });
    }

    static delReply(domainId: string, psid: ObjectId, psrid: ObjectId) {
        return document.deleteSub(domainId, document.TYPE_PROBLEM_SOLUTION, psid, 'reply', psrid);
    }

    static async vote(domainId: string, psid: ObjectId, uid: number, value: number) {
        const doc = await document.get(domainId, document.TYPE_PROBLEM_SOLUTION, psid);
        if (!doc) throw new SolutionNotFoundError(domainId, psid);
        const before = await document.setStatus(
            domainId, document.TYPE_PROBLEM_SOLUTION, psid, uid,
            { vote: value }, 'before',
        );
        let inc = value;
        if (before?.vote) inc -= before.vote;
        return inc
            ? await document.inc(domainId, document.TYPE_PROBLEM_SOLUTION, psid, 'vote', inc)
            : doc;
    }

    static async getListStatus(domainId: string, psids: ObjectId[], uid: number) {
        const result: Record<string, { docId: ObjectId, vote: number }> = {};
        const res = await document.getMultiStatus(
            domainId, document.TYPE_PROBLEM_SOLUTION, { uid, docId: { $in: psids } },
        ).project<any>({ docId: 1, vote: 1 }).toArray();
        for (const i of res) result[i.docId] = i;
        return result;
    }
}

bus.on('problem/delete', async (domainId, docId) => {
    const psids = await document.getMulti(
        domainId, document.TYPE_PROBLEM_SOLUTION,
        { parentType: document.TYPE_PROBLEM, parentId: docId },
    ).project({ docId: 1 }).map((psdoc) => psdoc.docId).toArray();
    return await Promise.all([
        document.deleteMulti(domainId, document.TYPE_PROBLEM_SOLUTION, { docId: { $in: psids } }),
        document.deleteMultiStatus(domainId, document.TYPE_PROBLEM_SOLUTION, { docId: { $in: psids } }),
    ]);
});

export default SolutionModel;
global.Hydro.model.solution = SolutionModel;
