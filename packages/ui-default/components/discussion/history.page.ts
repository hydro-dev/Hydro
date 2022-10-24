import { InfoDialog } from 'vj/components/dialog';
import Notification from 'vj/components/notification';
import { AutoloadPage } from 'vj/misc/Page';
import i18n from 'vj/utils/i18n';
import tpl from 'vj/utils/tpl';

const page = new AutoloadPage('discussionHistoryPage', () => {
  if ($('[data-discussion-history]').length) {
    $(document).on('click', '[data-discussion-history]', async (ev) => {
      Notification.info(i18n('Loading...'));
      const rawData = await fetch(`${$(ev.currentTarget).data('raw-url')}?time=${$(ev.currentTarget).data('time')}`).then((r) => r.text());
      const md = await fetch('/markdown', {
        method: 'post',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: rawData, html: true }),
      }).then((r) => r.text());
      new InfoDialog({
        $body: tpl`
                <div class="typo">
                  <div data-user>${$(ev.currentTarget).data('uid')}</div>${{ templateRaw: true, html: $(ev.currentTarget).html() }}
                  ${{ templateRaw: true, html: md }}
                </div>
              `,
      }).open();
    });
  }
});

export default page;
