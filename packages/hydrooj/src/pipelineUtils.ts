/* eslint-disable no-await-in-loop */
import { DomainDoc } from './loader';
import domain from './model/domain';
import problem, { Field, Pdoc } from './model/problem';

export async function iterateAllDomain(cb: (ddoc: DomainDoc, current?: number, total?: number) => Promise<any>) {
    const ddocs = await domain.getMulti().project({ _id: 1, owner: 1 }).toArray();
    for (const i in ddocs) await cb(ddocs[i], +i, ddocs.length);
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
