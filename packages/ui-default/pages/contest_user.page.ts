import $ from 'jquery';
import UserSelectAutoComplete from 'vj/components/autocomplete/UserSelectAutoComplete';
import { ActionDialog } from 'vj/components/dialog';
import Notification from 'vj/components/notification';
import { NamedPage } from 'vj/misc/Page';
import {
  i18n, pjax, request, tpl,
} from 'vj/utils';

const page = new NamedPage('contest_user', () => {
  const addUserDialogContent = $(tpl`
    <div>
      <div class="row"><div class="columns">
        <h1>${i18n('Add User')}</h1>
      </div></div>
      <div class="row"><div class="columns">
        <label>
          ${i18n('Users')}
          <input name="add_user_users" type="text" class="textbox" autocomplete="off">
        </label>
      </div></div>
      <div class="row"><div class="columns">
        <label>
          ${i18n('Rank')} 
          <br />
          <label class="checkbox">
            <input type="checkbox" name="unrank" class="checkbox">${i18n('UnRank')} 
          </label>
        </label>
      </div></div>
    </div>
  `);
  addUserDialogContent.appendTo(document.body);
  const userSelect = UserSelectAutoComplete.getOrConstruct<UserSelectAutoComplete<true>>(
    addUserDialogContent.find('[name="add_user_users"]'),
    { multi: true, height: 'auto' },
  );

  const addUserDialog = new ActionDialog({
    $body: addUserDialogContent,
    onDispatch(action) {
      if (action === 'ok' && !userSelect.value()) {
        userSelect.focus();
        return false;
      }
      return true;
    },
  });
  addUserDialog.clear = function () {
    userSelect.clear();
    addUserDialog.$dom.find('[name="unrank"]').prop('checked', false);
    return this;
  };

  async function handleClickAddUser() {
    const action = await addUserDialog.clear().open();
    if (action !== 'ok') return;
    const unrank = addUserDialog.$dom.find('[name="unrank"]').prop('checked');
    const uids = userSelect.value();
    try {
      const res = await request.post('', {
        operation: 'add_user',
        uids: uids.join(','),
        unrank,
      });
      if (res.url && res.url !== window.location.href) window.location.href = res.url;
      else {
        Notification.success(i18n('User added.'));
        pjax.request({ push: false });
      }
    } catch (error) {
      Notification.error([error.message, ...error.params].join(' '));
    }
  }

  async function handleEditRank(ev) {
    const uid = $(ev.target).data('uid');
    try {
      const res = await request.post('', {
        operation: 'rank',
        uid,
      });
      if (res.url && res.url !== window.location.href) window.location.href = res.url;
      else {
        Notification.success(i18n('Ranking status updated.'));
        pjax.request({ push: false });
      }
    } catch (error) {
      Notification.error([error.message, ...error.params].join(' '));
    }
  }

  $('[name="add_user"]').on('click', () => handleClickAddUser());
  $(document).on('click', '[name="edit_rank"]', handleEditRank);
});

export default page;
