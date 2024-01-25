import { UIInjectableFields } from '../interface';
import { PERM, PRIV } from '../model/builtin';

const trueChecker = () => true;
const Checker = (perm: bigint | bigint[], priv: number | number[], checker: Function = trueChecker) => (handler) => (
    checker(handler)
    && (perm ? handler.user.hasPerm(perm) : true)
    && (priv ? handler.user.hasPriv(priv) : true)
);
type PermPrivChecker = Array<number | bigint | Function | number[] | bigint[]>;
const buildChecker = (...permPrivChecker: PermPrivChecker) => {
    let _priv: number | number[];
    let _perm: bigint | bigint[];
    let checker: Function = trueChecker;
    for (const item of permPrivChecker) {
        if (typeof item === 'function') checker = item;
        else if (typeof item === 'number') _priv = item;
        else if (typeof item === 'bigint') _perm = item;
        else if (item instanceof Array) {
            if (typeof item[0] === 'number') _priv = item as number[];
            else _perm = item as bigint[];
        }
    }
    return Checker(_perm, _priv, checker);
};

export const nodes = new Proxy({}, {
    get(self, key) {
        self[key] ||= [];
        return self[key];
    },
});
export function inject(node: UIInjectableFields, name: string, args: Record<string, any> = {}, ...permPrivChecker: PermPrivChecker) {
    const obj = { name, args: args || {}, checker: buildChecker(...permPrivChecker) };
    const idx = obj.args.before ? nodes[node].findIndex((i) => i.name === obj.args.before) : -1;
    if (idx !== -1) {
        nodes[node] = nodes[node].filter((i) => i.name !== obj.name);
        nodes[node].splice(idx, 0, obj);
    } else nodes[node].push(obj);
    return () => { nodes[node] = nodes[node].filter((i) => i !== obj); };
}
export function getNodes(name: UIInjectableFields) {
    return nodes[name];
}
/** @deprecated */
export const Nav = (name, args, prefix, ...permPrivChecker) => {
    inject('Nav', name, { ...args, prefix }, ...permPrivChecker);
};
/** @deprecated */
export const ProblemAdd = (name, args, icon = 'add', text = 'Create Problem') => {
    inject('ProblemAdd', name, { ...args, icon, text });
};

inject('Nav', 'homepage', { prefix: 'homepage' });
inject('Nav', 'problem_main', { prefix: 'problem' }, PERM.PERM_VIEW_PROBLEM);
inject('Nav', 'training_main', { prefix: 'training' }, PERM.PERM_VIEW_TRAINING);
inject('Nav', 'contest_main', { prefix: 'contest' }, PERM.PERM_VIEW_CONTEST);
inject('Nav', 'homework_main', { prefix: 'homework' }, PERM.PERM_VIEW_HOMEWORK);
inject('Nav', 'discussion_main', { prefix: 'discussion' }, PERM.PERM_VIEW_DISCUSSION);
inject('Nav', 'record_main', {
    prefix: 'record',
    query: (handler) => (handler.user.hasPriv(PRIV.PRIV_USER_PROFILE)
        ? ({ uidOrName: handler.user._id })
        : ({})),
});
inject('Nav', 'ranking', { prefix: 'ranking' }, PERM.PERM_VIEW_RANKING);
inject('Nav', 'domain_dashboard', { prefix: 'domain' }, PERM.PERM_EDIT_DOMAIN);
inject('Nav', 'manage_dashboard', { prefix: 'manage' }, PRIV.PRIV_EDIT_SYSTEM);
inject('ProblemAdd', 'problem_create', { icon: 'add', text: 'Create Problem' });
inject('ControlPanel', 'manage_dashboard');
inject('ControlPanel', 'manage_script');
inject('ControlPanel', 'manage_user_import');
inject('ControlPanel', 'manage_user_priv');
inject('ControlPanel', 'manage_setting');
inject('ControlPanel', 'manage_config');
inject('DomainManage', 'domain_dashboard', { family: 'Properties', icon: 'info' });
inject('DomainManage', 'domain_edit', { family: 'Properties', icon: 'info' });
inject('DomainManage', 'domain_join_applications', { family: 'Properties', icon: 'info' });
inject('DomainManage', 'domain_role', { family: 'Access Control', icon: 'user' });
inject('DomainManage', 'domain_user', { family: 'Access Control', icon: 'user' });
inject('DomainManage', 'domain_permission', { family: 'Access Control', icon: 'user' });
inject('DomainManage', 'domain_group', { family: 'Access Control', icon: 'user' });

global.Hydro.ui.inject = inject;
global.Hydro.ui.nodes = nodes as any;
global.Hydro.ui.getNodes = getNodes;
Object.assign(global.Hydro.ui, { ProblemAdd, Nav });
