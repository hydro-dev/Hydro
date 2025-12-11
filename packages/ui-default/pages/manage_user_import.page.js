import $ from 'jquery';
import Notification from 'vj/components/notification';
import { NamedPage } from 'vj/misc/Page';
import { delay, i18n, request } from 'vj/utils';

const page = new NamedPage('manage_user_import', () => {
  async function post(draft) {
    try {
      const res = await request.post('', {
        users: $('[name="users"]').val(),
        draft,
      });
      if (!draft) {
        if (res.url) window.location.href = res.url;
        else if (res.error) throw new Error(res.error?.message || res.error);
        else {
          Notification.success(i18n('Created {0} users.', res.users.length));
          await delay(2000);
          window.location.reload();
        }
      } else {
        $('[name="messages"]').text(res.messages.join('\n'));
      }
    } catch (error) {
      Notification.error(error.message);
    }
  }

  $('[name="preview"]').on('click', () => post(true));
  $('[name="submit"]').on('click', () => post(false));
});

export default page;
