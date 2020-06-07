/* eslint-disable no-await-in-loop */
const contest = require('../model/contest');
const user = require('../model/user');
const rating = require('../lib/rating');

async function run({ domainId }, report) {
    const contests = await contest.getMulti(domainId).sort('endAt', -1).toArray();
    await report({ total: contests.length });
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
        await report({ current: i + 1 });
    }
}

global.Hydro.script.recalcRating = module.exports = { run };
