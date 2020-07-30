/* eslint-disable no-await-in-loop */
import { NumericDictionary, filter } from 'lodash';
import { ObjectID } from 'mongodb';
import { Tdoc, Pdoc } from '../interface';
import * as domain from '../model/domain';
import * as contest from '../model/contest';
import * as problem from '../model/problem';
import * as record from '../model/record';
import { STATUS } from '../model/builtin';
import rating from '../lib/rating';

export const description = 'Calculate rp of a domain, or all domains';

type ND = NumericDictionary<number>

function calc(udict: ND, rankedDocs: [number, number][]) {
    const users = [];
    for (const [rk, uid] of rankedDocs) {
        users.push({ uid, rank: rk, old: udict[uid] || 1500 });
    }
    // FIXME sum(rating.new) always less than sum(rating.old)
    const rated = rating(users);
    for (const udoc of rated) {
        udict[udoc.uid] = udoc.new;
    }
}

async function runProblem(pdoc: Pdoc, udict: ND): Promise<void>
async function runProblem(domainId: string, pid: number, udict: ND): Promise<void>
async function runProblem(...arg: any[]) {
    const pdoc: Pdoc = (typeof arg[0] === 'string')
        ? await problem.get(arg[0], arg[1], -1)
        : arg[0];
    const udict: ND = (typeof arg[0] === 'string') ? arg[2] : arg[1];
    const psdocs = await problem.getMultiStatus(
        pdoc.domainId, { docId: pdoc.docId, rid: { $ne: null } },
    ).toArray();
    if (!psdocs.length) return;
    const rdict = await record.getList(pdoc.domainId, psdocs.map((psdoc) => psdoc.rid), true);
    const nAccept = filter(psdocs, (psdoc) => psdoc.status === STATUS.STATUS_ACCEPTED).length;
    const p = (pdoc.difficulty || 5) / (Math.sqrt(Math.sqrt(nAccept)) + 1);
    for (const psdoc of psdocs) {
        if (rdict[psdoc.rid]) {
            const rp = rdict[psdoc.rid].score * p;
            udict[psdoc.uid] = (udict[psdoc.uid] || 1500) + rp;
        }
    }
}

async function runContest(tdoc: Tdoc, udict: ND, report: Function): Promise<void>
async function runContest(
    domainId: string, tid: ObjectID, udict: ND, report: Function
): Promise<void>
async function runContest(...arg: any[]) {
    const start = new Date().getTime();
    const tdoc: Tdoc = (typeof arg[0] === 'string')
        ? await contest.get(arg[0], arg[1], -1)
        : arg[0];
    const udict: ND = (typeof arg[0] === 'string') ? arg[2] : arg[1];
    const report = (typeof arg[0] === 'string') ? arg[3] : arg[2];
    const tsdocs = await contest.getMultiStatus(tdoc.domainId, tdoc.docId, tdoc.docType)
        .sort(contest.RULES[tdoc.rule].statusSort).toArray();
    if (!tsdocs.length) return;
    const rankedTsdocs = contest.RULES[tdoc.rule].rank(tsdocs);
    const ranked = [];
    for (const result of rankedTsdocs) {
        ranked.push([result[0], result[1].uid]);
    }
    calc(udict, ranked);
    await report({
        case: {
            status: STATUS.STATUS_ACCEPTED,
            message: `Contest ${tdoc.title} finished`,
            time: new Date().getTime() - start,
            memory: 0,
            score: 0,
        },
    });
}

async function runInDomain(domainId: string, isSub: boolean, report: Function) {
    await domain.setMultiUserInDomain(domainId, {}, { rp: 1500 });
    const udict: ND = {};
    const contests = await contest.getMulti(domainId, { rated: true }, -1).sort('endAt', -1).toArray();
    await report({ message: `Found ${contests.length} contests in ${domainId}` });
    for (const i in contests) {
        const tdoc = contests[i];
        await runContest(tdoc, udict, report);
        if (!isSub) {
            await report({
                progress: Math.floor(((parseInt(i, 10) + 1) / contests.length) * 100),
            });
        }
    }
    // TODO pagination
    const problems = await problem.getMulti(domainId, { hidden: false }).toArray();
    await report({ message: `Found ${problems.length} problems in ${domainId}` });
    for (const i in problems) {
        const pdoc = problems[i];
        await runProblem(pdoc, udict);
        if (!isSub) {
            await report({
                progress: Math.floor(((parseInt(i, 10) + 1) / problems.length) * 100),
            });
        }
    }
    const tasks = [];
    for (const uid in udict) {
        tasks.push(domain.setUserInDomain(domainId, parseInt(uid, 10), { rp: udict[uid] }));
    }
    await Promise.all(tasks);
}

export async function run({ domainId }, report: Function) {
    if (!domainId) {
        const domains = await domain.getMulti().toArray();
        await report({ message: `Found ${domains.length} domains` });
        for (const i in domains) {
            const start = new Date().getTime();
            await runInDomain(domains[i]._id, true, report);
            await report({
                case: {
                    status: STATUS.STATUS_ACCEPTED,
                    message: `Domain ${domains[i]._id} finished`,
                    time: new Date().getTime() - start,
                    memory: 0,
                    score: 0,
                },
                progress: Math.floor(((parseInt(i, 10) + 1) / domains.length) * 100),
            });
        }
    } else await runInDomain(domainId, false, report);
    return true;
}

export const validate = {
    $or: [
        { domainId: 'string' },
        { domainId: 'undefined' },
    ],
};

global.Hydro.script.rp = { run, description, validate };
