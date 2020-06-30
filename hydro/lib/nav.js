const { isNull } = require('lodash');
const { PRIV, PERM } = require('../model/builtin');

global.Hydro.ui.nav = [];

const trueChecker = () => true;
const Checker = (perm, priv, checker = trueChecker) => (handler) => (
    checker(handler)
    && (perm ? handler.user.hasPerm(perm) : true)
    && (priv ? handler.user.hasPriv(priv) : true)
);

const Item = (name, args, prefix, ...permPrivChecker) => {
    let _priv;
    let _perm;
    let checker = trueChecker;
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
    checker = Checker(_perm, _priv, checker);
    global.Hydro.ui.nav.push({
        name, args: args || {}, prefix, checker,
    });
};

Item('homepage', null, 'homepage');
Item('problem_main', null, 'problem', PERM.PERM_VIEW_PROBLEM);
Item('training_main', null, 'training', PERM.PERM_VIEW_TRAINING);
Item('homework_main', null, 'homework', PERM.PERM_VIEW_HOMEWORK);
Item('discussion_main', null, 'discussion', PERM.PERM_VIEW_DISCUSSION);
Item('contest_main', null, 'contest', PERM.PERM_VIEW_CONTEST);
Item('record_main', null, 'record');
Item('ranking', null, 'ranking');
Item('domain_dashboard', null, 'domain', PERM.PERM_EDIT_DOMAIN);
Item('manage_dashboard', null, 'manage', PRIV.PRIV_SET_PRIV);

global.Hydro.lib.nav = module.exports = Item;
