/* eslint-disable no-await-in-loop */
import type { DomainDoc, Udoc } from './interface';
import domain from './model/domain';
import user from './model/user';
import problem, { Field, Pdoc } from './model/problem';

export async function iterateAllDomain(cb: (ddoc: DomainDoc, current?: number, total?: number) => Promise<any>) {
    const ddocs = await domain.getMulti().toArray();
    for (const i in ddocs) await cb(ddocs[i], +i, ddocs.length);
}

export async function iterateAllUser(cb: (udoc: Udoc, current?: number, total?: number) => Promise<any>) {
    const udocs = await user.getMulti().toArray();
    for (const i in udocs) await cb(udocs[i], +i, udocs.length);
}

interface PartialPdoc extends Pdoc {
    [key: string]: any,
}

export async function iterateAllProblemInDomain(
    domainId: string,
    fields: (Field | string)[],
    cb: (pdoc: PartialPdoc, current?: number, total?: number) => Promise<any>,
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
    cb: (pdoc: PartialPdoc, current?: number, total?: number) => Promise<any>,
) {
    await iterateAllDomain(async (d) => {
        await iterateAllProblemInDomain(d._id, fields, cb);
    });
}
