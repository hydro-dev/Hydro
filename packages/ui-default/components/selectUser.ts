import UserSelectAutoComplete from 'vj/components/autocomplete/UserSelectAutoComplete';
import { ActionDialog } from 'vj/components/dialog';
import i18n from 'vj/utils/i18n';
import tpl from 'vj/utils/tpl';
import createHint from './hint';

let inserted = false;

export default async function selectUser(hint?: string) {
  if (!inserted) {
    const dialog = $(tpl`<div style="display: none" class="dialog__body--user-select"></div>`);
    dialog.appendTo(document.body);
    inserted = true;
  }
  const el = $(tpl`
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
  </div>`);
  el.appendTo($('.dialog__body--user-select'));
  if (hint) createHint(hint, $('[name="select_user_hint"]'));
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
  userSelector.clear();
  const action = await userSelectDialog.open();
  if (action !== 'ok') return null;
  return userSelector.value();
}

window.Hydro.components.selectUser = selectUser;
