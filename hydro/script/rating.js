const { ObjectID } = require('bson');
const contest = require('../model/contest');
const user = require('../model/user');
const rating = require('../lib/rating');

async function run({ domainId, contestId }) {
    contestId = new ObjectID(contestId);
    const tdoc = await contest.get(domainId, contestId);
    const tsdocs = await contest.getMultiStatus(domainId, { docId: contestId })
        .sort(contest.RULES[tdoc.rule].statusSort).toArray();
    const udict = await user.getList(domainId, tsdocs.map((tsdoc) => tsdoc.uid));
    const rankedTsdocs = contest.RULES[tdoc.rule].rank(tsdocs);
    const users = [];
    for (const result of rankedTsdocs) {
        users.push({ ...result[1], rank: result[0], old: udict[result[1].uid].rating || 1500 });
    }
    const rated = rating(users);
    return rated;
}

global.Hydro.script.rating = module.exports = { run };
