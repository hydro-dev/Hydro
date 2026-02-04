import $ from 'jquery';
import { confirm, prompt } from 'vj/components/dialog/index';
import Notification from 'vj/components/notification';
import { NamedPage } from 'vj/misc/Page';
import {
  i18n, pjax, request,
} from 'vj/utils';

const page = new NamedPage(['contest_user', 'homework_user'], () => {
  async function handleClickAddUser() {
    let uids = $('[name="uids"]').val() as string;
    uids = uids.trim().split(' ');
    if (uids.length === 0) return;
    uids = uids.filter((i) => i && i !== '');
    if (uids.length === 0) return;
    const unrank = $('[name="unrank"]').prop('checked');
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
      const err = error as { message?: string; params?: unknown };
      const params = Array.isArray(err.params)
        ? err.params
        : err.params
          ? [String(err.params)]
          : [];
      const message = [err.message, ...params].filter(Boolean).join(' ') || i18n('Unknown error');
      Notification.error(message);
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
      const err = error as { message?: string; params?: unknown };
      const params = Array.isArray(err.params)
        ? err.params
        : err.params
          ? [String(err.params)]
          : [];
      const message = [err.message, ...params].filter(Boolean).join(' ') || i18n('Unknown error');
      Notification.error(message);
    }
  }

  $('[name="add_user"]').on('click', () => handleClickAddUser());
  $(document).on('click', '[name="edit_rank"]', handleEditRank);
});

export default page;
