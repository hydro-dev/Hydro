import $ from 'jquery';
import _ from 'lodash';
import UserSelectAutoComplete from 'vj/components/autocomplete/UserSelectAutoComplete';
import { ActionDialog, ConfirmDialog, prompt } from 'vj/components/dialog';
import Notification from 'vj/components/notification';
import { NamedPage } from 'vj/misc/Page';
import {
  api, delay, i18n, tpl,
} from 'vj/utils';

function update(name: string, uids: number[] = []) {
  return api('domain.group', {
    name,
    uids,
  }, []);
}
function del(name: string) {
  return api('domain.group', {
    name,
  }, []);
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

  async function handleClickImportGroups() {
    const result = await prompt(i18n('Import Groups'), {
      groups: {
        type: 'textarea',
        label: i18n('Format: one group per line, CSV: groupName,uid1,uid2,...'),
        rows: 10,
        required: true,
        placeholder: 'group1,1001,1002,1003\ngroup2,1004,1005',
      },
    });
    if (!result) return;
    const lines = String(result.groups || '').replace(/^\uFEFF/, '').split('\n');
    const parsed = new Map<string, number[]>();
    const errors: string[] = [];
    lines.forEach((raw, idx) => {
      const line = raw.trim();
      if (!line) return;
      const [name, ...rest] = line.split(',').map((t) => t.trim());
      if (!name) return;
      const uids: number[] = [];
      for (const t of rest) {
        if (!t) continue;
        const uid = +t;
        if (!Number.isInteger(uid)) {
          errors.push(i18n('Line {0}: Invalid UID "{1}".', idx + 1, t));
          return;
        }
        uids.push(uid);
      }
      parsed.set(name, Array.from(new Set(uids)));
    });
    if (errors.length) {
      Notification.error(errors.join('\n'));
      return;
    }
    if (!parsed.size) {
      Notification.error(i18n('No groups to import.'));
      return;
    }
    try {
      for (const [name, uids] of parsed) {
        await update(name, uids);
      }
      Notification.success(i18n('Imported successfully.'));
      await delay(1500);
      window.location.reload();
    } catch (error) {
      Notification.error(error.message);
    }
  }

  async function handleClickExportGroups() {
    const rows: string[] = [];
    for (const gid of Object.keys(targets)) {
      const uids = targets[gid].value() as number[];
      rows.push([gid, ...uids].join(','));
    }
    await prompt(i18n('Export Groups'), {
      groups: {
        type: 'textarea',
        label: i18n('Copy the content below'),
        rows: 15,
        default: rows.join('\n'),
      },
    });
  }

  $('[name="create_group"]').click(() => handleClickCreateGroup());
  $('[name="import_groups"]').click(() => handleClickImportGroups());
  $('[name="export_groups"]').click(() => handleClickExportGroups());
  $('[name="remove_selected"]').click(() => handleClickDeleteSelected());
  $('[name="save_all"]').on('click', () => handleClickSaveAll());
});

export default page;
