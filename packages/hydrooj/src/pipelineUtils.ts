/* eslint-disable no-await-in-loop */
import { FilterQuery } from 'mongodb';
import type {
    DomainDoc, ProblemStatusDoc, RecordDoc,
    Udoc,
} from './interface';
import * as document from './model/document';
import domain from './model/domain';
import problem, { Field, ProblemDoc } from './model/problem';
import RecordModel from './model/record';
import user from './model/user';

export async function iterateAllDomain(cb: (ddoc: DomainDoc, current?: number, total?: number) => Promise<any>) {
    const ddocs = await domain.getMulti().toArray();
    for (const i in ddocs) await cb(ddocs[i], +i, ddocs.length);
}

export async function iterateAllUser(cb: (udoc: Udoc, current?: number, total?: number) => Promise<any>) {
    const udocs = await user.getMulti().toArray();
    for (const i in udocs) await cb(udocs[i], +i, udocs.length);
}

export async function iterateAllPsdoc(filter: FilterQuery<ProblemStatusDoc>, cb: (psdoc: ProblemStatusDoc) => Promise<any>) {
    await iterateAllDomain(async ({ _id: domainId }) => {
        const cursor = document.getMultiStatus(domainId, document.TYPE_PROBLEM, filter);
        while (await cursor.hasNext()) {
            const psdoc = await cursor.next();
            await cb(psdoc);
        }
    });
}

interface PartialProblemDoc extends ProblemDoc {
    [key: string]: any,
}

export async function iterateAllProblemInDomain(
    domainId: string,
    fields: (Field | string)[],
    cb: (pdoc: PartialProblemDoc, current?: number, total?: number) => Promise<any>,
) {
    if (!fields.includes('domainId')) fields.push('domainId');
    if (!fields.includes('docId')) fields.push('docId');
    const cursor = problem.getMulti(domainId, {}, fields as any);
    const total = await problem.getMulti(domainId, {}).count();
    let i = 0;
    while (await cursor.hasNext()) {
        const doc = await cursor.next();
        i++;
        const res = await cb(doc, i, total);
        if (res) await problem.edit(doc.domainId, doc.docId, res);
    }
}

export async function iterateAllProblem(
    fields: (Field | string)[],
    cb: (pdoc: PartialProblemDoc, current?: number, total?: number) => Promise<any>,
) {
    await iterateAllDomain(async (d) => {
        await iterateAllProblemInDomain(d._id, fields, cb);
    });
}

export async function iterateAllRecord(
    cb: (rdoc: RecordDoc, current: number, total: number) => any,
) {
    const total = await RecordModel.coll.count();
    let i = 0;
    const cursor = RecordModel.coll.find().sort('_id', 1);
    while (await cursor.hasNext()) {
        const rdoc = await cursor.next();
        i++;
        await cb(rdoc, i, total);
    }
}
