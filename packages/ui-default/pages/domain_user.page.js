import $ from 'jquery';
import _ from 'lodash';
import { confirm, InfoDialog, prompt } from 'vj/components/dialog';
import Notification from 'vj/components/notification';
import { NamedPage } from 'vj/misc/Page';
import {
  delay, i18n, request, tpl,
} from 'vj/utils';

const page = new NamedPage('domain_user', () => {
  $('.not-joined').data('tooltip', i18n('Click to view detailed instructions.'));
  $('.not-joined').addClass('text-orange');
  $(document).on('click', '.not-joined', () => {
    new InfoDialog({
      $body: tpl`
        <div class="typo">
          <p>${i18n('Users will have to manually join the domain first before selected roles can be applied.')}</p>
          <p>${i18n('To join the domain, users can click the "Join Domain" button on "My Domain" page.')}</p>
          <p>${i18n('Or use the following link:')}</p>
          <p><a href="/domain/join?target=${UiContext.domain._id}">/domain/join?target=${UiContext.domain._id}</a></p>
        </div>`,
    }).open();
  });

  async function handleClickAddUser() {
    const res = await prompt(i18n('Add User'), {
      user: {
        type: 'userId',
        required: true,
        autofocus: true,
        label: i18n('Username / UID'),
        columns: 6,
      },
      role: {
        type: 'text',
        required: true,
        label: 'Role',
        options: UiContext.roles.filter((i) => !['default', 'guest'].includes(i)),
        columns: -6,
      },
      ...(UiContext.canForceJoin ? {
        join: {
          type: 'checkbox',
          label: i18n('Mark user as joined using admin privilege'),
        },
      } : {}),
    });
    if (!res?.user || !res?.role) return;
    try {
      await request.post('', {
        operation: 'set_users',
        uids: [res.user],
        role: res.role,
        join: res.join,
      });
      window.location.reload();
    } catch (error) {
      Notification.error(error.message);
    }
  }

  function ensureAndGetSelectedUsers() {
    const users = _.map(
      $('.domain-users tbody [type="checkbox"]:checked'),
      (ch) => $(ch).attr('data-uid') || $(ch).closest('tr').attr('data-uid'),
    );
    if (users.length === 0) {
      Notification.error(i18n('Please select at least one user to perform this operation.'));
      return null;
    }
    return users;
  }

  async function handleClickRemoveSelected() {
    const selectedUsers = ensureAndGetSelectedUsers();
    if (selectedUsers === null) return;
    if (!(await confirm(`${i18n('Confirm removing the selected users?')}
${i18n('Their account will not be deleted and they will be with the guest role until they re-join the domain.')}`))) return;
    try {
      await request.post('', {
        operation: 'kick',
        uids: selectedUsers,
      });
      Notification.success(i18n('Selected users have been removed from the domain.'));
      await delay(2000);
      window.location.reload();
    } catch (error) {
      Notification.error(error.message);
    }
  }

  async function handleClickSetSelected() {
    const res = await prompt('Set Role', {
      role: {
        type: 'text',
        required: true,
        label: 'Set Roles for selected users',
        options: UiContext.roles.filter((i) => !['guest'].includes(i)),
      },
    });
    if (!res?.role) return;
    const selectedUsers = ensureAndGetSelectedUsers();
    if (selectedUsers === null) return;
    try {
      await request.post('', {
        operation: 'set_users',
        uids: selectedUsers,
        role: res.role,
      });
      Notification.success(i18n('Role has been updated to {0} for selected users.', res.role));
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
        operation: 'set_users',
        uids: [row.attr('data-uid')],
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
