/* eslint-disable no-await-in-loop */
import { Filter } from 'mongodb';
import type {
    DomainDoc, ProblemStatusDoc, RecordDoc,
    Tdoc, Udoc,
} from './interface';
import * as contest from './model/contest';
import * as document from './model/document';
import domain from './model/domain';
import problem, { Field, ProblemDoc } from './model/problem';
import RecordModel from './model/record';
import user from './model/user';

export async function iterateAllDomain(cb: (ddoc: DomainDoc, current?: number, total?: number) => Promise<any>) {
    const ddocs = await domain.getMulti().toArray();
    for (const i in ddocs) await cb(ddocs[i], +i, ddocs.length);
    return true;
}

export async function iterateAllUser(cb: (udoc: Udoc, current?: number, total?: number) => Promise<any>) {
    const udocs = await user.getMulti({}).toArray();
    for (const i in udocs) await cb(udocs[i], +i, udocs.length);
    return true;
}

export async function iterateAllContest(cb: (tdoc: Tdoc) => Promise<any>) {
    return await iterateAllDomain(async (ddoc) => {
        const tdocs = await contest.getMulti(ddoc._id, {}).toArray();
        for (const tdoc of tdocs) {
            await cb(tdoc);
        }
    });
}

export async function iterateAllPsdoc(filter: Filter<ProblemStatusDoc>, cb: (psdoc: ProblemStatusDoc) => Promise<any>) {
    return await iterateAllDomain(async ({ _id: domainId }) => {
        const cursor = document.getMultiStatus(domainId, document.TYPE_PROBLEM, filter);
        while (await cursor.hasNext()) {
            const psdoc = await cursor.next();
            await cb(psdoc);
        }
    });
}

interface PartialProblemDoc extends ProblemDoc {
    [key: string]: any;
}

export async function iterateAllProblemInDomain(
    domainId: string,
    fields: (Field | string)[],
    cb: (pdoc: PartialProblemDoc, current?: number, total?: number) => Promise<any>,
) {
    if (!fields.includes('domainId')) fields.push('domainId');
    if (!fields.includes('docId')) fields.push('docId');
    const cursor = problem.getMulti(domainId, {}, fields as any);
    const total = await problem.count(domainId, {});
    let i = 0;
    for await (const doc of cursor) {
        i++;
        const res = await cb(doc, i, total);
        if (res) await problem.edit(doc.domainId, doc.docId, res);
    }
    return true;
}

export async function iterateAllProblem(
    fields: (Field | string)[],
    cb: (pdoc: PartialProblemDoc, current?: number, total?: number) => Promise<any>,
) {
    return await iterateAllDomain(async (d) => {
        await iterateAllProblemInDomain(d._id, fields, cb);
    });
}

export async function iterateAllRecord(
    cb: (rdoc: RecordDoc, current: number, total: number) => any,
) {
    const total = await RecordModel.coll.countDocuments();
    let i = 0;
    const cursor = RecordModel.coll.find().sort('_id', 1);
    for await (const rdoc of cursor) {
        i++;
        await cb(rdoc, i, total);
    }
    return true;
}
