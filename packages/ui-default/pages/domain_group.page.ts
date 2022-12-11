import $ from 'jquery';
import _ from 'lodash';
import UserSelectAutoComplete from 'vj/components/autocomplete/UserSelectAutoComplete';
import { ActionDialog, ConfirmDialog } from 'vj/components/dialog';
import Notification from 'vj/components/notification';
import { NamedPage } from 'vj/misc/Page';
import {
  api, delay, gql, i18n, tpl,
} from 'vj/utils';

function update(name: string, uids: number[]) {
  return api(gql`
    domain { manage { group {
      update(name: ${name}, uids: ${uids})
    } } }
  `);
}
function del(name: string) {
  return api(gql`
    domain { manage { group {
      del(name: ${name})
    } } }
  `);
}

const page = new NamedPage('domain_group', () => {
  const createGroupDialogContent = $(tpl`
    <div>
      <div class="row"><div class="columns">
        <h1>${i18n('Create Group')}</h1>
      </div></div>
      <div class="row"><div class="columns">
        <label>
          ${i18n('Group Name')}
          <input name="create_group_name" type="text" class="textbox" data-autofocus>
        </label>
      </div></div>
      <div class="row"><div class="columns">
        <label>
          ${i18n('Users')}
          <input name="create_group_users" type="text" class="textbox" autocomplete="off">
        </label>
      </div></div>
    </div>
  `);
  createGroupDialogContent.appendTo(document.body);
  const userSelect = UserSelectAutoComplete.getOrConstruct<UserSelectAutoComplete<true>>(
    createGroupDialogContent.find('[name="create_group_users"]'),
    { multi: true, height: 'auto' },
  );
  const targets = {};
  $('input[data-gid]').get().forEach((ele) => {
    const input = UserSelectAutoComplete.getOrConstruct<UserSelectAutoComplete<true>>($(ele), { multi: true, height: 'auto' });
    const gid = ele.getAttribute('data-gid');
    targets[gid] = input;
    let loaded = false;
    input.onChange(() => {
      if (input.value().length && !loaded) {
        loaded = true;
        return;
      }
      if (!loaded) return;
      update(gid, input.value());
    });
  });

  const createGroupDialog = new ActionDialog({
    $body: createGroupDialogContent,
    onDispatch(action) {
      const $name = createGroupDialog.$dom.find('[name="create_group_name"]');
      if (action === 'ok' && ($name.val() === '' || !userSelect.value())) {
        $name.focus();
        return false;
      }
      return true;
    },
  });
  createGroupDialog.clear = function () {
    userSelect.clear();
    createGroupDialog.$dom.find('[name="create_group_name"]').val('');
    return this;
  };

  function ensureAndGetSelectedGroups() {
    const groups = _.map(
      $('.domain-group tbody [type="checkbox"]:checked'),
      (ch) => $(ch).closest('tr').attr('data-gid'),
    );
    if (groups.length === 0) {
      Notification.error(i18n('Please select at least one group to perform this operation.'));
      return null;
    }
    return groups;
  }

  async function handleClickCreateGroup() {
    const action = await createGroupDialog.clear().open();
    if (action !== 'ok') return;
    const name = createGroupDialog.$dom.find('[name="create_group_name"]').val() as string;
    const uids = userSelect.value();
    try {
      await update(name, uids);
      window.location.reload();
    } catch (error) {
      Notification.error(error.message);
    }
  }

  async function handleClickDeleteSelected() {
    const selectedGroups = ensureAndGetSelectedGroups();
    if (selectedGroups === null) return;
    const action = await new ConfirmDialog({
      $body: tpl.typoMsg(i18n('Confirm deleting the selected groups?')),
    }).open();
    if (action !== 'yes') return;
    try {
      await Promise.all(selectedGroups.map((name) => del(name)));
      Notification.success(i18n('Selected groups have been deleted.'));
      await delay(2000);
      window.location.reload();
    } catch (error) {
      Notification.error(error.message);
    }
  }

  async function handleClickSaveAll() {
    for (const gid of Object.keys(targets)) {
      const uids = targets[gid].value();
      try {
        await update(gid, uids);
      } catch (error) {
        Notification.error(error.message);
      }
    }
    Notification.success(i18n('Saved.'));
  }

  $('[name="create_group"]').click(() => handleClickCreateGroup());
  $('[name="remove_selected"]').click(() => handleClickDeleteSelected());
  $('[name="save_all"]').on('click', () => handleClickSaveAll());
});

export default page;
