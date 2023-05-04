import $ from 'jquery';
import Notification from 'vj/components/notification';
import { AutoloadPage } from 'vj/misc/Page';
import { delay, i18n, request } from 'vj/utils';

const contestPage = new AutoloadPage('contestPage', () => {
  $('[data-contest-code]').on('click', (ev) => {
    ev.preventDefault();
    // eslint-disable-next-line no-alert
    const code = prompt(i18n('Invitation code:'));
    request.post('', {
      operation: 'attend',
      code,
    }).then(() => {
      Notification.success(i18n('Successfully attended'));
      delay(1000).then(() => window.location.reload());
    }).catch((e) => {
      Notification.error(e.message || e);
    });
  });
});

export default contestPage;
