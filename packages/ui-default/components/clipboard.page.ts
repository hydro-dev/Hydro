import Clipboard from 'clipboard';
import Notification from 'vj/components/notification';
import { AutoloadPage } from 'vj/misc/Page';
import { base64, i18n, substitute } from 'vj/utils';

export default new AutoloadPage('clipboard', () => {
  $('[data-copy]').get().forEach((el) => {
    const data = $(el).attr('data-copy');
    const decoded = base64.decode(data);
    const clip = new Clipboard(el, { text: () => decoded });
    clip.on('success', () => {
      Notification.success(substitute(i18n('"{data}" copied to clipboard!'), { data: decoded }), 2000);
    });
    clip.on('error', () => {
      Notification.error(substitute(i18n('Copy "{data}" failed :('), { data: decoded }));
    });
  });
  $('[data-copylink]').each(function () {
    const clip = new Clipboard(this, { text: () => new URL(this.dataset.copylink, document.location.href).toString() });
    clip.on('success', () => Notification.success(i18n('Link copied to clipboard!')));
    clip.on('error', () => Notification.error(i18n('Copy failed :(')));
  });
});
