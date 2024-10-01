import $ from 'jquery';
import _ from 'lodash';
import UserSelectAutoComplete from 'vj/components/autocomplete/UserSelectAutoComplete';
import { ActionDialog, ConfirmDialog } from 'vj/components/dialog';
import Notification from 'vj/components/notification';
import { NamedPage } from 'vj/misc/Page';
import {
  delay, i18n, request, tpl,
} from 'vj/utils';

const page = new NamedPage('domain_user', () => {
  const addUserSelector = UserSelectAutoComplete.getOrConstruct($('.dialog__body--add-user [name="user"]'));
  const addUserDialog = new ActionDialog({
    $body: $('.dialog__body--add-user > div'),
    onDispatch(action) {
      const $role = addUserDialog.$dom.find('[name="role"]');
      if (action === 'ok') {
        if (addUserSelector.value() === null) {
          addUserSelector.focus();
          return false;
        }
        if (!$role.val()) {
          $role.focus();
          return false;
        }
      }
      return true;
    },
  });
  const firstRoleForAddUser = addUserDialog.$dom.find('[name="role"] option').first().val();
  addUserDialog.clear = function () {
    addUserSelector.clear();
    this.$dom.find('[name="role"]').val(firstRoleForAddUser);
    return this;
  };

  const setRolesDialog = new ActionDialog({
    $body: $('.dialog__body--set-role > div'),
    onDispatch(action) {
      const $role = setRolesDialog.$dom.find('[name="role"]');
      if (action === 'ok' && !$role.val()) {
        $role.focus();
        return false;
      }
      return true;
    },
  });
  const firstRoleForSetRole = setRolesDialog.$dom.find('[name="role"] option').first().val();
  setRolesDialog.clear = function () {
    this.$dom.find('[name="role"]').val(firstRoleForSetRole);
    return this;
  };

  async function handleClickAddUser() {
    const action = await addUserDialog.clear().open();
    if (action !== 'ok') {
      return;
    }
    const user = addUserSelector.value();
    const role = addUserDialog.$dom.find('[name="role"]').val();
    try {
      await request.post('', {
        operation: 'set_user',
        uid: user._id,
        role,
      });
      window.location.reload();
    } catch (error) {
      Notification.error(error.message);
    }
  }

  function ensureAndGetSelectedUsers() {
    const users = _.map(
      $('.domain-users tbody [type="checkbox"]:checked'),
      (ch) => $(ch).closest('tr').attr('data-uid'),
    );
    if (users.length === 0) {
      Notification.error(i18n('Please select at least one user to perform this operation.'));
      return null;
    }
    return users;
  }

  async function handleClickRemoveSelected() {
    const selectedUsers = ensureAndGetSelectedUsers();
    if (selectedUsers === null) {
      return;
    }
    const action = await new ConfirmDialog({
      $body: tpl`
        <div class="typo">
          <p>${i18n('Confirm removing the selected users?')}</p>
          <p>${i18n('Their account will not be deleted and they will be with the default role.')}</p>
        </div>`,
    }).open();
    if (action !== 'yes') return;
    try {
      await request.post('', {
        operation: 'set_users',
        uid: selectedUsers,
        role: 'default',
      });
      Notification.success(i18n('Selected users have been removed from the domain.'));
      await delay(2000);
      window.location.reload();
    } catch (error) {
      Notification.error(error.message);
    }
  }

  async function handleClickSetSelected() {
    const selectedUsers = ensureAndGetSelectedUsers();
    if (selectedUsers === null) {
      return;
    }
    const action = await setRolesDialog.clear().open();
    if (action !== 'ok') {
      return;
    }
    const role = setRolesDialog.$dom.find('[name="role"]').val();
    try {
      await request.post('', {
        operation: 'set_users',
        uid: selectedUsers,
        role,
      });
      Notification.success(i18n('Role has been updated to {0} for selected users.', role));
      await delay(2000);
      window.location.reload();
    } catch (error) {
      Notification.error(error.message);
    }
  }

  async function handleChangeUserRole(ev) {
    const row = $(ev.currentTarget).closest('tr');
    const role = $(ev.currentTarget).val();
    try {
      await request.post('', {
        operation: 'set_user',
        uid: row.attr('data-uid'),
        role,
      });
      Notification.success(i18n('Role has been updated to {0}.', role));
    } catch (error) {
      Notification.error(error.message);
    }
  }

  $('[name="add_user"]').click(() => handleClickAddUser());
  $('[name="remove_selected"]').click(() => handleClickRemoveSelected());
  $('[name="set_roles"]').click(() => handleClickSetSelected());
  $('.domain-users [name="role"]').change((ev) => handleChangeUserRole(ev));
});

export default page;
