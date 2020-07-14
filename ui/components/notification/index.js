import tpl from 'vj/utils/tpl';
import zIndexManager from 'vj/utils/zIndexManager';

let lastNotification = null;
let autoHideTimer = null;

export default class Notification {
  static success(message, duration) {
    return Notification.show({ type: 'success', message, duration });
  }

  static info(message, duration) {
    return Notification.show({ type: 'info', message, duration });
  }

  static warn(message, duration) {
    return Notification.show({ type: 'warn', message, duration });
  }

  static error(message, duration) {
    return Notification.show({ type: 'error', message, duration });
  }

  static show({
    avatar, title, message, type, duration = 3000,
    actionButtons = [],
  }) {
    if (duration && lastNotification) {
      Notification.hide();
    }
    const $dom = $(tpl`<div class="notification ${type} hide"></div>`);
    if (avatar) $(tpl`<img width="64" height="64" class="avatar" src="${avatar}"></img>`).appendTo($dom);
    if (title) $(tpl`${title} `).appendTo($dom);
    $(tpl`${message}`).appendTo($dom);
    actionButtons.forEach((button) => {
      $(tpl`<button class="${button.class}" onclick="javascript:window.${button.funcName}();">${button.name}</button>`).appendTo($dom);
    });
    const $n = $dom
      .css('z-index', zIndexManager.getNext())
      .appendTo('body');
    $n.width(); // force reflow
    $n.removeClass('hide');
    if (duration) {
      lastNotification = $n;
      autoHideTimer = setTimeout(Notification.hide, duration);
    }
    return $n;
  }

  static hide($node) {
    if (!$node) {
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
    } else {
      $node.addClass('hide');
      setTimeout(() => $node.remove(), 200);
    }
  }
}
