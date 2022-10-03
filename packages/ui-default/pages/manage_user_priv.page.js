import $ from 'jquery';
import UserSelectAutoComplete from 'vj/components/autocomplete/UserSelectAutoComplete';
import { ActionDialog } from 'vj/components/dialog';
import Notification from 'vj/components/notification';
import { NamedPage } from 'vj/misc/Page';
import i18n from 'vj/utils/i18n';
import request from 'vj/utils/request';

const page = new NamedPage('manage_user_priv', () => {
  const selectUserSelector = UserSelectAutoComplete.getOrConstruct($('.dialog__body--select-user [name="user"]'));
  const selectUserDialog = new ActionDialog({
    $body: $('.dialog__body--select-user > div'),
    onDispatch(action) {
      if (action === 'ok' && selectUserSelector.value() === null) {
        selectUserSelector.focus();
        return false;
      }
      return true;
    },
  });
  selectUserDialog.clear = function () {
    selectUserSelector.clear();
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
    return this;
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
      console.log(e.name, e.checked, e.value, userPriv);
      if (e.checked) userPriv |= e.value;
    });
    changeUserPriv(uid, userPriv);
  }

  async function handleClickSelectUser() {
    const action = await selectUserDialog.clear().open();
    if (action !== 'ok') {
      return;
    }
    const user = await fetch(`/user/${selectUserSelector.value()._id}`, {
      headers: {
        accept: 'application/json',
      },
    }).then((res) => res.json());
    handleOpenUserPrivDialog(user.udoc);
  }

  $('[name="select_user"]').on('click', () => handleClickSelectUser());
  $('[name="set_priv"]').on('click', (ev) => handleOpenUserPrivDialog(ev));
});

export default page;
