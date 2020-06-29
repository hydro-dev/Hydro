const { isNull } = require('lodash');

const permission = require('../model/builtin').PERM;

global.Hydro.ui.nav = [];

const trueChecker = () => true;
const Item = (name, args, prefix, ...permPrivChecker) => {
    let _priv;
    let _perm;
    let checker;
    for (const item of permPrivChecker) {
        if (typeof item === 'object' && !isNull(item)) {
            if (typeof item.call !== 'undefined') {
                checker = item;
            } if (typeof item[0] === 'number') {
                _priv = item;
            } else if (typeof item[0] === 'string') {
                _perm = item;
            }
        } else if (typeof item === 'number') {
            _priv = item;
        } else if (typeof item === 'string') {
            _perm = item;
        }
    }
    if ((_perm || _priv) && checker) {
        checker = ((_chk) => (handler) => _chk(handler)
            && (_perm ? handler.user.hasPerm(_perm) : true)
            && (_priv ? handler.user.hasPriv(_priv) : true))(checker);
    } else if (_perm) {
        checker = (handler) => handler.user.hasPerm(_perm);
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
