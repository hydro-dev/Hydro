/* eslint-disable no-cond-assign */
/* eslint-disable no-await-in-loop */
import { NumericDictionary, unionWith } from 'lodash';
import { Filter, ObjectId } from 'mongodb';
import Schema from 'schemastery';
import { Counter } from '@hydrooj/utils';
import { Tdoc, Udoc } from '../interface';
import difficultyAlgorithm from '../lib/difficulty';
import rating from '../lib/rating';
import { PRIV, STATUS } from '../model/builtin';
import * as contest from '../model/contest';
import domain from '../model/domain';
import problem from '../model/problem';
import UserModel from '../model/user';
import db from '../service/db';

export const description = 'Calculate rp of a domain, or all domains';

type ND = NumericDictionary<number>;
type Report = (data: any) => void;

interface RpDef {
    run(domainIds: string[], udict: ND, report: Report): Promise<void>;
    hidden: boolean;
    base: number;
}

const { log, max, min } = Math;

export const RpTypes: Record<string, RpDef> = {
    problem: {
        async run(domainIds, udict, report) {
            const problems = await problem.getMulti('', { domainId: { $in: domainIds }, nAccept: { $gt: 0 }, hidden: false }).toArray();
            if (problems.length) await report({ message: `Found ${problems.length} problems in ${domainIds[0]}` });
            for (const pdoc of problems) {
                const cursor = problem.getMultiStatus(
                    pdoc.domainId,
                    {
                        docId: pdoc.docId,
                        rid: { $ne: null },
                        uid: { $ne: pdoc.owner },
                        score: { $gt: 0 },
                    },
                );
                const difficulty = +pdoc.difficulty || difficultyAlgorithm(pdoc.nSubmit, pdoc.nAccept) || 5;
                const p = difficulty / 100;
                let psdoc;
                while (psdoc = await cursor.next()) {
                    udict[psdoc.uid] += min(psdoc.score, 100) * p;
                }
            }
            for (const key in udict) udict[key] = max(0, min(udict[key], log(udict[key]) / log(1.03)));
        },
        hidden: false,
        base: 0,
    },
    contest: {
        async run(domainIds, udict, report) {
            const contests: Tdoc[] = await contest.getMulti('', { domainId: { $in: domainIds }, rated: true })
                .limit(10).toArray() as any;
            if (contests.length) await report({ message: `Found ${contests.length} contests in ${domainIds[0]}` });
            for (const tdoc of contests.reverse()) {
                const start = Date.now();
                const query = {
                    docId: tdoc.docId,
                    journal: { $ne: null },
                };
                if (!await contest.countStatus(tdoc.domainId, query)) continue;
                const cursor = contest.getMultiStatus(tdoc.domainId, query).sort(contest.RULES[tdoc.rule].statusSort);
                const rankedTsdocs = await contest.RULES[tdoc.rule].ranked(tdoc, cursor);
                const users = rankedTsdocs.map((i) => ({ uid: i[1].uid, rank: i[0], old: udict[i[1].uid] }));
                // FIXME sum(rating.new) always less than sum(rating.old)
                for (const udoc of rating(users)) udict[udoc.uid] = udoc.new;
                await report({
                    case: {
                        status: STATUS.STATUS_ACCEPTED,
                        message: `Contest ${tdoc.title} finished`,
                        time: Date.now() - start,
                        memory: 0,
                        score: 0,
                    },
                });
            }
            for (const key in udict) udict[key] = max(1, udict[key] / 4 - 375);
        },
        hidden: false,
        base: 1500,
    },
    delta: {
        async run(domainIds, udict) {
            const dudocs = unionWith(
                await domain.getMultiUserInDomain(
                    '', { domainId: { $in: domainIds }, rpdelta: { $exists: true } },
                ).toArray(),
                (a, b) => a.uid === b.uid,
            );
            for (const dudoc of dudocs) udict[dudoc.uid] = dudoc.rpdelta;
        },
        hidden: true,
        base: 0,
    },
};
global.Hydro.model.rp = RpTypes;

export async function calcLevel(domainId: string, report: Report) {
    await domain.setMultiUserInDomain(domainId, {}, { level: 0, rank: null });
    let last = { rp: null };
    let rank = 0;
    let count = 0;
    const coll = db.collection('domain.user');
    const filter = { rp: { $gt: 0 }, uid: { $nin: [0, 1], $gt: -1000 } };
    const ducur = domain.getMultiUserInDomain(domainId, filter)
        .project<{ _id: ObjectId, rp: number }>({ rp: 1 })
        .sort({ rp: -1 });
    let bulk = coll.initializeUnorderedBulkOp();
    for await (const dudoc of ducur) {
        count++;
        dudoc.rp ||= null;
        if (dudoc.rp !== last.rp) rank = count;
        bulk.find({ _id: dudoc._id }).updateOne({ $set: { rank } });
        last = dudoc;
        if (count % 100 === 0) report({ message: `#${count}: Rank ${rank}` });
    }
    if (!count) return;
    await bulk.execute();
    const levels = global.Hydro.model.builtin.LEVELS;
    bulk = coll.initializeUnorderedBulkOp();
    for (let i = 0; i < levels.length; i++) {
        const query: Filter<Udoc> = {
            domainId,
            $and: [{ rank: { $lte: (levels[i] * count) / 100 } }],
        };
        if (i < levels.length - 1) query.$and.push({ rank: { $gt: (levels[i + 1] * count) / 100 } });
        bulk.find(query).update({ $set: { level: i } });
    }
    await bulk.execute();
}

async function runInDomain(domainId: string, report: Report) {
    const results: Record<keyof typeof RpTypes, ND> = {};
    const udict = Counter();
    await db.collection('domain.user').updateMany({ domainId }, { $set: { rpInfo: {} } });
    for (const type in RpTypes) {
        results[type] = new Proxy({}, { get: (self, key) => self[key] || RpTypes[type].base });
        await RpTypes[type].run([domainId], results[type], report);
        const bulk = db.collection('domain.user').initializeUnorderedBulkOp();
        for (const uid in results[type]) {
            const udoc = await UserModel.getById(domainId, +uid);
            if (!udoc?.hasPriv(PRIV.PRIV_USER_PROFILE)) continue;
            bulk.find({ domainId, uid: +uid }).updateOne({ $set: { [`rpInfo.${type}`]: results[type][uid] } });
            udict[+uid] += results[type][uid];
        }
        if (bulk.batches.length) await bulk.execute();
    }
    await domain.setMultiUserInDomain(domainId, {}, { rp: 0 });
    const bulk = db.collection('domain.user').initializeUnorderedBulkOp();
    for (const uid in udict) {
        bulk.find({ domainId, uid: +uid }).upsert().update({ $set: { rp: Math.max(0, udict[uid]) } });
    }
    if (bulk.batches.length) await bulk.execute();
    await calcLevel(domainId, report);
}

export async function run({ domainId }, report: Report) {
    if (!domainId) {
        const domains = await domain.getMulti().toArray();
        await report({ message: `Found ${domains.length} domains` });
        for (const i in domains) {
            const start = new Date().getTime();
            await runInDomain(domains[i]._id, report);
            await report({
                case: {
                    status: STATUS.STATUS_ACCEPTED,
                    message: `Domain ${domains[i]._id} finished`,
                    time: new Date().getTime() - start,
                    memory: 0,
                    score: 0,
                },
                progress: Math.floor(((+i + 1) / domains.length) * 100),
            });
        }
    } else await runInDomain(domainId, report);
    return true;
}

export const apply = (ctx) => ctx.addScript(
    'rp', 'Calculate rp of a domain, or all domains',
    Schema.object({ domainId: Schema.string() }), run,
);
