/* eslint-disable no-await-in-loop */
const domain = require('../model/domain');
const contest = require('../model/contest');
const user = require('../model/user');
const rating = require('../lib/rating');

async function run({ domainId, isSub = false }, report) {
    if (!domainId) {
        const domains = await domain.getMulti().toArray();
        await report({ total: domains.length });
        for (const i in domains) {
            await run({ domainId: domains[i]._id, isSub: true }, report);
            await report({ current: parseInt(i) + 1 });
        }
        return true;
    }
    const contests = await contest.getMulti(domainId).sort('endAt', -1).toArray();
    await report({ total: contests.length });
    await user.setMultiInDomain(domainId, {}, { rating: 1500 });
    for (const i in contests) {
        const tdoc = contests[i];
        const tsdocs = await contest.getMultiStatus(domainId, { docId: tdoc.docId })
            .sort(contest.RULES[tdoc.rule].statusSort).toArray();
        const udict = await user.getList(domainId, tsdocs.map((tsdoc) => tsdoc.uid));
        const rankedTsdocs = contest.RULES[tdoc.rule].rank(tsdocs);
        const users = [];
        for (const result of rankedTsdocs) {
            users.push({ ...result[1], rank: result[0], old: udict[result[1].uid].rating || 1500 });
        }
        const rated = rating(users);
        const tasks = [];
        for (const udoc of rated) {
            tasks.push(user.setInDomain(domainId, udoc.uid, { rating: udoc.new }));
        }
        await Promise.all(tasks);
        if (isSub) await report({ subProgress: (i + 1) / contests.length });
        else await report({ current: parseInt(i) + 1 });
    }
    return true;
}

global.Hydro.script.recalcRating = module.exports = { run };
