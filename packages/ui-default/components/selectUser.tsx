import React from 'react';
import UserSelectAutoComplete from 'vj/components/autocomplete/UserSelectAutoComplete';
import { ActionDialog } from 'vj/components/dialog';
import { i18n, tpl } from 'vj/utils';
import createHint from './hint';

let hintInserted = false;
$(tpl(
  <div style={{ display: 'none' }}>
    <div className="dialog__body--user-select">
      <div className="row"><div className="columns">
        <h1 id="select_user_hint">{i18n('Select User')}</h1>
      </div></div>
      <div className="row">
        <div className="columns">
          <label>{i18n('Username / UID')}
            <input name="user" type="text" className="textbox" autoComplete="off" data-autofocus />
          </label>
        </div>
      </div>
    </div>
  </div>,
)).appendTo(document.body);
const userSelector = UserSelectAutoComplete.getOrConstruct($('.dialog__body--user-select [name="user"]')) as any;
const userSelectDialog = new ActionDialog({
  $body: $('.dialog__body--user-select'),
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
    createHint(hint, $('#select_user_hint'));
    hintInserted = true;
  }
  userSelector.clear();
  const action = await userSelectDialog.open();
  if (action !== 'ok') return null;
  return userSelector.value();
}

window.Hydro.components.selectUser = selectUser;
