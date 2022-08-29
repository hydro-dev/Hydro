import Clipboard from 'clipboard';
import Notification from 'vj/components/notification';
import { AutoloadPage } from 'vj/misc/Page';
import i18n from 'vj/utils/i18n';

export default new AutoloadPage('clipboard', () => {
  $('[data-copy]').each(function () {
    const clip = new Clipboard(this, { text: () => this.dataset.copy });
    clip.on('success', () => Notification.success(i18n('Copied to clipboard!')));
    clip.on('error', () => Notification.error(i18n('Copy failed :(')));
  });
  $('[data-copylink]').each(function () {
    const clip = new Clipboard(this, { text: () => new URL(this.dataset.copylink, document.location.href).toString() });
    clip.on('success', () => Notification.success(i18n('Link copied to clipboard!')));
    clip.on('error', () => Notification.error(i18n('Copy failed :(')));
  });
});
