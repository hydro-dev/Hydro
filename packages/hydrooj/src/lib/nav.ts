import { isNull } from 'lodash';
import { PERM, PRIV } from '../model/builtin';

global.Hydro.ui.nav = [];

const trueChecker = () => true;
const Checker = (perm: bigint, priv: number, checker: Function = trueChecker) => (handler) => (
    checker(handler)
    && (perm ? handler.user.hasPerm(perm) : true)
    && (priv ? handler.user.hasPriv(priv) : true)
);

const Item = (
    name: string, args: any, prefix: string,
    ...permPrivChecker: Array<number | bigint | Function>
) => {
    let _priv: number;
    let _perm: bigint;
    let checker: Function = trueChecker;
    for (const item of permPrivChecker) {
        if (item instanceof Object && !isNull(item)) {
            if (item instanceof Array) {
                if (typeof item[0] === 'number') {
                    // @ts-ignore
                    _priv = item;
                } else if (typeof item[0] === 'bigint') {
                    // @ts-ignore
                    _perm = item;
                }
            } else if (typeof item.call !== 'undefined') {
                checker = item;
            }
        } else if (typeof item === 'number') {
            _priv = item;
        } else if (typeof item === 'bigint') {
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
Item('ranking', null, 'ranking', PERM.PERM_VIEW_RANKING);
Item('domain_dashboard', null, 'domain', PERM.PERM_EDIT_DOMAIN);
Item('manage_dashboard', null, 'manage', PRIV.PRIV_EDIT_SYSTEM);

global.Hydro.lib.nav = Item;
export default Item;
