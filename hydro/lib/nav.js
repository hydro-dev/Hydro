const permission = require('../permission');

global.Hydro.ui.nav = [];

const Item = (path, name, prefix, perm) => {
    global.Hydro.ui.nav.push({
        path, name, prefix, perm,
    });
};

Item('/', 'domain_main', 'domain_main');
Item('/p', 'problem_main', 'problem', permission.PERM_VIEW_PROBLEM);
Item('/t', 'training_main', 'training', permission.PERM_VIEW_TRAINING);
Item('/discuss', 'discussion_main', 'discussion', permission.PERM_VIEW_DISCUSSION);
Item('/c', 'contest_main', 'contest', permission.PERM_VIEW_CONTEST);
Item('/manage', 'domain_manage', 'domain_manage', permission.PERM_MANAGE);

global.Hydro.lib.nav = module.exports = Item;
