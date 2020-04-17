const { Route, Handler } = require('../service/server');
const contest = require('../model/contest');
const user = require('../model/user');
const training = require('../model/training');
const { PERM_VIEW_TRAINING, PERM_VIEW_CONTEST, PERM_VIEW_DISCUSSION } = require('../permission');
const { CONTESTS_ON_MAIN, TRAININGS_ON_MAIN, DISCUSSIONS_ON_MAIN } = require('../options').constants;

class HomeHandler extends Handler {
    async contest() {
        if (this.user.hasPerm(PERM_VIEW_CONTEST)) {
            const tdocs = await contest.getMulti()
                .limit(CONTESTS_ON_MAIN)
                .toArray();
            const tsdict = await contest.getListStatus(
                this.user._id, tdocs.map((tdoc) => tdoc._id),
            );
            return [tdocs, tsdict];
        }
        return [[], {}];
    }

    async training() {
        if (this.user.hasPerm(PERM_VIEW_TRAINING)) {
            const tdocs = await training.getMulti()
                .sort('_id', 1)
                .limit(TRAININGS_ON_MAIN)
                .toArray();
            const tsdict = await training.getListStatus(
                this.user._id, tdocs.map((tdoc) => tdoc._id),
            );
            return [tdocs, tsdict];
        }
        return [[], {}];
    }

    async discussion() {
        // TODO(masnn)
        // if (this.user.hasPerm(PERM_VIEW_DISCUSSION)) {
        //     const ddocs = await discussion.getMulti()
        //         .limit(DISCUSSIONS_ON_MAIN)
        //         .toArray();
        //     const vndict = await discussion.getListVnodes(map(discussion.node_id, ddocs));
        //     return [ddocs, vndict];
        // }
        return [[], {}];
    }

    async get() {
        const [[tdocs, tsdict], [trdocs, trsdict], [ddocs, vndict]] = await Promise.all([
            this.contest(), this.training(), this.discussion(),
        ]);
        const udict = await user.getList(ddocs.map((ddoc) => ddoc.owner));
        this.response.template = 'main.html';
        this.response.body = {
            tdocs, tsdict, trdocs, trsdict, ddocs, vndict, udict,
        };
    }
}

Route('/', HomeHandler);
