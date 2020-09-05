import { Dictionary, isNull } from 'lodash';
import { PERM, PRIV } from '../model/builtin';

const trueChecker = () => true;
const Checker = (perm: bigint, priv: number, checker: Function = trueChecker) => (handler) => (
    checker(handler)
    && (perm ? handler.user.hasPerm(perm) : true)
    && (priv ? handler.user.hasPriv(priv) : true)
);
const buildChecker = (...permPrivChecker: Array<number | bigint | Function>) => {
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
    return Checker(_perm, _priv, checker);
};

export const Nav = (
    name: string, args: Dictionary<any> = {}, prefix: string,
    ...permPrivChecker: Array<number | bigint | Function>
) => {
    global.Hydro.ui.nodes.nav.push({
        name, args: args || {}, prefix, checker: buildChecker(...permPrivChecker),
    });
};

export const ProblemAdd = (
    name: string, args: Dictionary<any> = {}, icon = 'add', text = 'Create Problem',
) => {
    global.Hydro.ui.nodes.problem_add.push({
        name, args, icon, text,
    });
};

Nav('homepage', {}, 'homepage');
Nav('problem_main', {}, 'problem', PERM.PERM_VIEW_PROBLEM);
Nav('training_main', {}, 'training', PERM.PERM_VIEW_TRAINING);
Nav('homework_main', {}, 'homework', PERM.PERM_VIEW_HOMEWORK);
Nav('discussion_main', {}, 'discussion', PERM.PERM_VIEW_DISCUSSION);
Nav('contest_main', {}, 'contest', PERM.PERM_VIEW_CONTEST);
Nav('record_main', {}, 'record');
Nav('ranking', {}, 'ranking', PERM.PERM_VIEW_RANKING);
Nav('domain_dashboard', {}, 'domain', PERM.PERM_EDIT_DOMAIN);
Nav('manage_dashboard', {}, 'manage', PRIV.PRIV_EDIT_SYSTEM);
ProblemAdd('problem_create');
ProblemAdd('problem_import_syzoj', {}, 'copy', 'Import From SYZOJ');

global.Hydro.ui.Nav = Nav;
global.Hydro.ui.ProblemAdd = ProblemAdd;
