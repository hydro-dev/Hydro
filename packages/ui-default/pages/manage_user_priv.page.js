import $ from 'jquery';
import UserSelectAutoComplete from 'vj/components/autocomplete/UserSelectAutoComplete';
import { ActionDialog } from 'vj/components/dialog';
import Notification from 'vj/components/notification';
import { NamedPage } from 'vj/misc/Page';
import i18n from 'vj/utils/i18n';
import request from 'vj/utils/request';

const page = new NamedPage('manage_user_priv', () => {
  const addUserSelector = UserSelectAutoComplete.getOrConstruct($('.dialog__body--add-user [name="user"]'));
  const addUserDialog = new ActionDialog({
    $body: $('.dialog__body--add-user > div'),
    onDispatch(action) {
      if (action === 'ok' && addUserSelector.value() === null) {
        addUserSelector.focus();
        return false;
      }
      return true;
    },
  });
  addUserDialog.clear = function () {
    addUserSelector.clear();
    return this;
  };

  const setPrivDialog = new ActionDialog({
    $body: $('.dialog__body--set-priv > div'),
    width: `${window.innerWidth - 200}px`,
    height: `${window.innerHeight - 100}px`,
  });
  setPrivDialog.clear = function (priv) {
    this.$dom.find('input.priv[type=checkbox]:hidden').each((i, e) => {
      e.checked = priv & e.value;
    });
  };

  async function changeUserPriv(uid, priv) {
    try {
      await request.post('', {
        uid,
        priv,
      });
      Notification.success(i18n('Priv has been updated to {0}.', priv));
      window.location.reload();
    } catch (error) {
      Notification.error(error.message);
    }
  }

  async function handleOpenUserPrivDialog(ev) {
    const uid = ev.target ? $(ev.target).data('uid') : ev._id;
    const priv = ev.target ? $(ev.target).data('priv') : ev.priv;
    await setPrivDialog.clear(priv);
    const action = await setPrivDialog.open();
    if (action !== 'ok') return;
    let userPriv = 0;
    setPrivDialog.$dom.find('input.priv[type=checkbox]').each((i, e) => {
      if (e.checked) userPriv |= 1 << e.value;
    });
    changeUserPriv(uid, userPriv);
  }

  async function handleClickAddUser() {
    const action = await addUserDialog.clear().open();
    if (action !== 'ok') {
      return;
    }
    const user = addUserSelector.value();
    handleOpenUserPrivDialog(user);
  }

  $('[name="add_user"]').on('click', () => handleClickAddUser());
  $('[name="set_priv"]').on('click', (ev) => handleOpenUserPrivDialog(ev));
});

export default page;
