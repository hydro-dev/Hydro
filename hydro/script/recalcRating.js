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
    const contests = await contest.getMulti(domainId, { rated: true }).sort('endAt', -1).toArray();
    await report({ total: contests.length });
    const udict = {};
    for (const i in contests) {
        const tdoc = contests[i];
        const tsdocs = await contest.getMultiStatus(domainId, { docId: tdoc.docId })
            .sort(contest.RULES[tdoc.rule].statusSort).toArray();
        const rankedTsdocs = contest.RULES[tdoc.rule].rank(tsdocs);
        const users = [];
        for (const result of rankedTsdocs) {
            users.push({ ...result[1], rank: result[0], old: udict[result[1].uid] || 1500 });
        }
        const rated = rating(users);
        for (const udoc of rated) {
            udict[udoc.uid] = udoc.new;
        }
        if (isSub) await report({ subProgress: (i + 1) / contests.length });
        else await report({ current: parseInt(i) + 1 });
    }
    const tasks = [];
    for (const uid in udict) {
        tasks.push(user.setInDomain(domainId, parseInt(uid), { rating: udict[uid] }));
    }
    await Promise.all(tasks);
    return true;
}

global.Hydro.script.recalcRating = module.exports = { run };
