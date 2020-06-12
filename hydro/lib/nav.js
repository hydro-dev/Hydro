const permission = require('../permission');

global.Hydro.ui.nav = [];

const trueChecker = () => true;
const Item = (name, args, prefix, perm, checker) => {
    if (perm && checker) {
        checker = ((_chk) => (handler) => _chk(handler) && handler.user.hasPerm(perm))(checker);
    } else if (perm) {
        checker = (handler) => handler.user.hasPerm(perm);
    } else if (!checker) checker = trueChecker;
    global.Hydro.ui.nav.push({
        name, args: args || {}, prefix, checker,
    });
};

Item('homepage', null, 'homepage');
Item('problem_main', null, 'problem', permission.PERM_VIEW_PROBLEM);
Item('training_main', null, 'training', permission.PERM_VIEW_TRAINING);
Item('homework_main', null, 'homework', permission.PERM_VIEW_HOMEWORK);
Item('discussion_main', null, 'discussion', permission.PERM_VIEW_DISCUSSION);
Item('contest_main', null, 'contest', permission.PERM_VIEW_CONTEST);
Item('record_main', null, 'record');
Item('ranking', null, 'ranking');
Item('domain_dashboard', null, 'domain', permission.PERM_MANAGE);
Item('manage_dashboard', null, 'manage', null, (handler) => handler.user.priv === 1);

global.Hydro.lib.nav = module.exports = Item;
