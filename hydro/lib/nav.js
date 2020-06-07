const permission = require('../permission');

global.Hydro.ui.nav = [];

const trueChecker = () => true;

const Item = (path, name, prefix, perm, checker) => {
    if (perm && checker) {
        checker = ((_chk) => (handler) => _chk(handler) && handler.user.hasPerm(perm))(checker);
    } else if (perm) {
        checker = (handler) => handler.user.hasPerm(perm);
    } else checker = trueChecker;
    global.Hydro.ui.nav.push({
        path, name, prefix, checker,
    });
};

Item('/', 'domain_main', 'domain_main');
Item('/p', 'problem_main', 'problem', permission.PERM_VIEW_PROBLEM);
Item('/t', 'training_main', 'training', permission.PERM_VIEW_TRAINING);
Item('/homework', 'homework_main', 'homework', permission.PERM_VIEW_HOMEWORK);
Item('/discuss', 'discussion_main', 'discussion', permission.PERM_VIEW_DISCUSSION);
Item('/c', 'contest_main', 'contest', permission.PERM_VIEW_CONTEST);
Item('/domain/dashboard', 'domain_dashboard', 'domain', permission.PERM_MANAGE);
Item('/manage/dashboard', 'manage', 'manage', null, (handler) => handler.user.priv === 1);

global.Hydro.lib.nav = module.exports = Item;
