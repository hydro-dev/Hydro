/* eslint-disable no-await-in-loop */
import { NumericDictionary } from 'lodash';
import { ObjectID, FilterQuery } from 'mongodb';
import { Tdoc, Pdoc, Udoc } from '../interface';
import domain from '../model/domain';
import * as contest from '../model/contest';
import problem from '../model/problem';
import record from '../model/record';
import { STATUS } from '../model/builtin';
import rating from '../lib/rating';
import paginate from '../lib/paginate';

export const description = 'Calculate rp of a domain, or all domains';

type ND = NumericDictionary<number>;

async function runProblem(pdoc: Pdoc, udict: ND): Promise<void>;
async function runProblem(domainId: string, pid: number, udict: ND): Promise<void>;
async function runProblem(...arg: any[]) {
    const pdoc: Pdoc = (typeof arg[0] === 'string')
        ? await problem.get(arg[0], arg[1], -1)
        : arg[0];
    const udict: ND = (typeof arg[0] === 'string') ? arg[2] : arg[1];
    const [, nPages] = await paginate(
        problem.getMultiStatus(
            pdoc.domainId, { docId: pdoc.docId, rid: { $ne: null } },
        ),
        1,
        100,
    );
    const nAccept = await problem.getMultiStatus(
        pdoc.domainId, { docId: pdoc.docId, status: STATUS.STATUS_ACCEPTED },
    ).count();
    const p = (pdoc.difficulty || 5) / (Math.sqrt(Math.sqrt(nAccept)) + 1);
    for (let page = 1; page <= nPages; page++) {
        const [psdocs] = await paginate(
            problem.getMultiStatus(
                pdoc.domainId, { docId: pdoc.docId, rid: { $ne: null } },
            ),
            page,
            100,
        );
        const rdict = await record.getList(pdoc.domainId, psdocs.map((psdoc) => psdoc.rid), true);
        for (const psdoc of psdocs) {
            if (rdict[psdoc.rid]) {
                const rp = rdict[psdoc.rid].score * p;
                udict[psdoc.uid] = (udict[psdoc.uid] || 1500) + rp;
            }
        }
    }
}

async function runContest(tdoc: Tdoc<30 | 60>, udict: ND, report: Function): Promise<void>;
async function runContest(
    domainId: string, tid: ObjectID, udict: ND, report: Function
): Promise<void>;
async function runContest(...arg: any[]) {
    const start = new Date().getTime();
    const tdoc: Tdoc<30 | 60> = (typeof arg[0] === 'string')
        ? await contest.get(arg[0], arg[1], -1)
        : arg[0];
    const udict: ND = (typeof arg[0] === 'string') ? arg[2] : arg[1];
    const report = (typeof arg[0] === 'string') ? arg[3] : arg[2];
    const tsdocs = await contest.getMultiStatus(tdoc.domainId, tdoc.docId, tdoc.docType)
        .sort(contest.RULES[tdoc.rule].statusSort).toArray();
    if (!tsdocs.length) return;
    const rankedTsdocs = contest.RULES[tdoc.rule].rank(tsdocs);
    const users = [];
    for (const result of rankedTsdocs) {
        users.push({ uid: result[1].uid, rank: result[0], old: udict[result[1].uid] || 1500 });
    }
    // FIXME sum(rating.new) always less than sum(rating.old)
    const rated = rating(users);
    for (const udoc of rated) udict[udoc.uid] = udoc.new;
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

export async function calcLevel(domainId: string, report: Function) {
    const dudocs = await domain.getMultiUserInDomain(domainId).sort('rp', -1).toArray();
    if (!dudocs.length) return;
    let last = { rp: null };
    let rank = 0;
    let count = 0;
    const coll = global.Hydro.service.db.collection('domain.user');
    let bulk = coll.initializeUnorderedBulkOp();
    for (const dudoc of dudocs) {
        count++;
        if (!dudoc.rp) dudoc.rp = null;
        if (dudoc.rp !== last.rp) rank = count;
        bulk.find({ _id: dudoc._id }).updateOne({ $set: { rank } });
        last = dudoc;
        if (count % 1000 === 0) report({ message: `#${count}: Rank ${rank}` });
    }
    await bulk.execute();
    if (!rank) {
        report({ message: 'No one has rp' });
        return;
    }
    const levels = global.Hydro.model.builtin.LEVELS;
    bulk = coll.initializeUnorderedBulkOp();
    for (let i = 0; i < levels.length; i++) {
        report({ message: 'Updating users levelled {0}'.format(levels[i][0]) });
        const query: FilterQuery<Udoc> = {
            domainId,
            $and: [{ rank: { $lte: (levels[i][1] * rank) / 100 } }],
        };
        if (i < levels.length - 1) query.$and.push({ rank: { $gt: (levels[i + 1][1] * rank) / 100 } });
        bulk.find(query).update({ $set: { level: levels[i][0] } });
    }
    await bulk.execute();
}

async function runInDomain(domainId: string, isSub: boolean, report: Function) {
    const udict: ND = {};
    const deltaudict: ND = {};
    const dudocs = await domain.getMultiUserInDomain(domainId).toArray();
    for (const dudoc of dudocs) {
        deltaudict[dudoc.uid] = dudoc.rpdelta || 0;
    }
    const contests: Tdoc<30 | 60>[] = await contest.getMulti(domainId, { rated: true })
        .sort('endAt', -1).toArray() as any;
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
    await domain.setMultiUserInDomain(domainId, {}, { rp: 1500 });
    const tasks = [];
    for (const uid in udict) {
        tasks.push(
            domain.setUserInDomain(
                domainId, parseInt(uid, 10), { rp: udict[uid] + (deltaudict[uid] || 0) },
            ),
        );
    }
    await Promise.all(tasks);
    await calcLevel(domainId, report);
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
