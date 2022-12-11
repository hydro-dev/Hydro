import UserSelectAutoComplete from 'vj/components/autocomplete/UserSelectAutoComplete';
import { ActionDialog } from 'vj/components/dialog';
import { i18n, tpl } from 'vj/utils';
import createHint from './hint';

let hintInserted = false;
$(tpl`<div style="display: none" class="dialog__body--user-select">
  <div class="row"><div class="columns">
    <h1 name="select_user_hint">${i18n('Select User')}</h1>
  </div></div>
  <div class="row">
    <div class="columns">
      <label>${i18n('Username / UID')}
        <input name="user" type="text" class="textbox" autocomplete="off" data-autofocus>
      </label>
    </div>
  </div>
</div>`).appendTo(document.body);
const userSelector = UserSelectAutoComplete.getOrConstruct($('.dialog__body--user-select [name="user"]')) as any;
const userSelectDialog = new ActionDialog({
  $body: $('.dialog__body--user-select > div'),
  onDispatch(action) {
    if (action === 'ok' && userSelector.value() === null) {
      userSelector.focus();
      return false;
    }
    return true;
  },
});

export default async function selectUser(hint?: string) {
  if (hint && !hintInserted) {
    createHint(hint, $('[name="select_user_hint"]'));
    hintInserted = true;
  }
  userSelector.clear();
  const action = await userSelectDialog.open();
  if (action !== 'ok') return null;
  return userSelector.value();
}

window.Hydro.components.selectUser = selectUser;
