import tpl from 'vj/utils/tpl';
import zIndexManager from 'vj/utils/zIndexManager';

let lastNotification = null;
let autoHideTimer = null;

export default class Notification {
  static success(message, duration) {
    Notification.show({ type: 'success', message, duration });
  }

  static info(message, duration) {
    Notification.show({ type: 'info', message, duration });
  }

  static warn(message, duration) {
    Notification.show({ type: 'warn', message, duration });
  }

  static error(message, duration) {
    Notification.show({ type: 'error', message, duration });
  }

  static show({ message, type = 'info', duration = 3000 }) {
    if (lastNotification) {
      Notification.hide();
    }
    const $n = $(tpl`<div class="notification ${type} hide">${message}</div>`)
      .css('z-index', zIndexManager.getNext())
      .appendTo('body');
    $n.width(); // force reflow
    $n.removeClass('hide');
    lastNotification = $n;
    autoHideTimer = setTimeout(Notification.hide, duration);
  }

  static hide() {
    if (!lastNotification) {
      return;
    }
    if (autoHideTimer) {
      clearTimeout(autoHideTimer);
      autoHideTimer = null;
    }
    const $n = lastNotification;
    $n.addClass('hide');
    setTimeout(() => $n.remove(), 200);
    lastNotification = null;
  }
}
