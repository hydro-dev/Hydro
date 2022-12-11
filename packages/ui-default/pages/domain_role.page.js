import $ from 'jquery';
import _ from 'lodash';
import { ActionDialog, ConfirmDialog } from 'vj/components/dialog';
import Notification from 'vj/components/notification';
import { NamedPage } from 'vj/misc/Page';
import {
  delay, i18n, request, tpl,
} from 'vj/utils';

const page = new NamedPage('domain_role', () => {
  const createRoleDialog = new ActionDialog({
    $body: $('.dialog__body--create-role > div'),
    onDispatch(action) {
      const $role = createRoleDialog.$dom.find('[name="role"]');
      if (action === 'ok' && $role.val() === '') {
        $role.focus();
        return false;
      }
      return true;
    },
  });
  createRoleDialog.clear = function () {
    this.$dom.find('[name="role"]').val('');
    return this;
  };

  function ensureAndGetSelectedRoles() {
    const roles = _.map(
      $('.domain-roles tbody [type="checkbox"]:checked'),
      (ch) => $(ch).closest('tr').attr('data-role'),
    );
    if (roles.length === 0) {
      Notification.error(i18n('Please select at least one role to perform this operation.'));
      return null;
    }
    return roles;
  }

  async function handleClickCreateRole() {
    const action = await createRoleDialog.clear().open();
    if (action !== 'ok') return;
    const role = createRoleDialog.$dom.find('[name="role"]').val();
    try {
      await request.post('', {
        operation: 'add',
        role,
      });
      window.location.reload();
    } catch (error) {
      Notification.error(error.message);
    }
  }

  async function handleClickDeleteSelected() {
    const selectedRoles = ensureAndGetSelectedRoles();
    if (selectedRoles === null) return;
    const action = await new ConfirmDialog({
      $body: tpl`
        <div class="typo">
          <p>${i18n('Confirm deleting the selected roles?')}</p>
          <p>${i18n('Users with those roles will be removed from the domain.')}</p>
        </div>`,
    }).open();
    if (action !== 'yes') return;
    try {
      await request.post('', {
        operation: 'delete',
        roles: selectedRoles,
      });
      Notification.success(i18n('Selected roles have been deleted.'));
      await delay(2000);
      window.location.reload();
    } catch (error) {
      Notification.error(error.message);
    }
  }

  $('[name="create_role"]').on('click', () => handleClickCreateRole());
  $('[name="delete_selected"]').on('click', () => handleClickDeleteSelected());
});

export default page;
