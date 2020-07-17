/* eslint-disable no-await-in-loop */
import { NumericDictionary } from 'lodash';
import { ObjectID } from 'mongodb';
import * as domain from '../model/domain';
import * as contest from '../model/contest';
import * as problem from '../model/problem';
import rating from '../lib/rating';
import { STATUS } from '../model/builtin';
import { Tdoc, Pdoc } from '../interface';

export const description = 'Calculate rating of a domain, or all domains';

type ND = NumericDictionary<number>

function calc(udict: ND, rankedDocs: [number, number][]) {
    const users = [];
    for (const [rank, uid] of rankedDocs) {
        users.push({ uid, rank, old: users[uid] || 1500 });
    }
    const rated = rating(users);
    for (const udoc of rated) {
        udict[udoc.uid] = udoc.new;
    }
}

async function runProblem(pdoc: Pdoc, udict: ND, report: Function): Promise<void>
async function runProblem(
    domainId: string, pid: number, udict: ND, report: Function
): Promise<void>
async function runProblem(...arg: Array<any>) {
    const start = new Date().getTime();
    const pdoc: Pdoc = (typeof arg[0] === 'string')
        ? await contest.get(arg[0], arg[1], -1)
        : arg[0];
    const udict: ND = (typeof arg[0] === 'string') ? arg[2] : arg[1];
    const report = (typeof arg[0] === 'string') ? arg[3] : arg[2];
    // TODO maybe some other rules?
    // TODO pagination
    const psdocs = await problem.getMultiStatus(
        pdoc.domainId, { docId: pdoc.docId, status: STATUS.STATUS_ACCEPTED },
    ).sort('rid', 1).toArray();
    const ranked = [];
    for (const index of psdocs) {
        ranked.push([index + 1, psdocs[index].uid]);
    }
    calc(udict, ranked);
    await report({
        case: {
            status: STATUS.STATUS_ACCEPTED,
            judgeText: `Problem ${pdoc.title} finished`,
            time_ms: new Date().getTime() - start,
            memory_kb: 0,
            score: 0,
        },
    });
}

async function runContest(tdoc: Tdoc, udict: ND, report: Function): Promise<void>
async function runContest(
    domainId: string, tid: ObjectID, udict: ND, report: Function
): Promise<void>
async function runContest(...arg: Array<any>) {
    const start = new Date().getTime();
    const tdoc: Tdoc = (typeof arg[0] === 'string')
        ? await contest.get(arg[0], arg[1], -1)
        : arg[0];
    const udict: ND = (typeof arg[0] === 'string') ? arg[2] : arg[1];
    const report = (typeof arg[0] === 'string') ? arg[3] : arg[2];
    const tsdocs = await contest.getMultiStatus(tdoc.domainId, tdoc.docId, tdoc.docType)
        .sort(contest.RULES[tdoc.rule].statusSort).toArray();
    const rankedTsdocs = contest.RULES[tdoc.rule].rank(tsdocs);
    const ranked = [];
    for (const result of rankedTsdocs) {
        ranked.push([result[0], result[1].uid]);
    }
    calc(udict, ranked);
    await report({
        case: {
            status: STATUS.STATUS_ACCEPTED,
            judgeText: `Contest ${tdoc.title} finished`,
            time_ms: new Date().getTime() - start,
            memory_kb: 0,
            score: 0,
        },
    });
}

async function runInDomain(domainId: string, isSub: boolean, report: Function) {
    await domain.setMultiUserInDomain(domainId, {}, { rating: 1500 });
    const udict: ND = {};
    // TODO pagination
    const problems = await problem.getMulti(domainId, { hidden: false }).toArray();
    await report({ message: `Found ${problems.length} problems in ${domainId}` });
    for (const i in problems) {
        const pdoc = problems[i];
        runProblem(pdoc, udict, report);
        if (!isSub) {
            await report({
                progress: Math.floor(((parseInt(i, 10) + 1) / problems.length) * 100),
            });
        }
    }
    const contests = await contest.getMulti(domainId, { rated: true }, -1).sort('endAt', -1).toArray();
    await report({ message: `Found ${contests.length} contests in ${domainId}` });
    for (const i in contests) {
        const tdoc = contests[i];
        runContest(tdoc, udict, report);
        if (!isSub) {
            await report({
                progress: Math.floor(((parseInt(i, 10) + 1) / contests.length) * 100),
            });
        }
    }
    const tasks = [];
    for (const uid in udict) {
        tasks.push(domain.setUserInDomain(domainId, parseInt(uid, 10), { rating: udict[uid] }));
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
                    judgeText: `Domain ${domains[i]._id} finished`,
                    time_ms: new Date().getTime() - start,
                    memory_kb: 0,
                    score: 0,
                },
                progress: Math.floor(((parseInt(i, 10) + 1) / domains.length) * 100),
            });
        }
    } else runInDomain(domainId, false, report);
    return true;
}

export const validate = {
    $or: [
        { domainId: 'string' },
        { domainId: 'undefined' },
    ],
};

global.Hydro.script.recalcRating = { run, description, validate };
