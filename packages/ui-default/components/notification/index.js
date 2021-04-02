import tpl from 'vj/utils/tpl';
import zIndexManager from 'vj/utils/zIndexManager';

let lastNotification = null;
let autoHideTimer = null;

export default class Notification {
  constructor({
    avatar, title, message, type = '', duration = 3000, action,
  }) {
    this.type = type;
    if (avatar) this.type += ' avatar';
    if (title) this.type += ' title';
    this.action = (() => { }) || action;
    this.$dom = $(tpl`<div class="notification ${type} hide"></div>`);
    if (avatar) $(tpl`<img width="64" height="64" class="avatar" src="${avatar}"></img>`).appendTo(this.$dom);
    if (title) $(tpl`<h2>${title}</h2>`).appendTo(this.$dom);
    $(tpl`<p>${message}</p>`).appendTo(this.$dom);
    this.$dom.on('clink', this.handleClick.bind(this));
    this.$n = this.$dom
      .css('z-index', zIndexManager.getNext())
      .appendTo('body');
    this.$n.width(); // force reflow
    this.$n.removeClass('hide');
    if (duration) this.autoHideTimer = setTimeout(this.hide.bind(this), duration);
  }

  handleClick() {
    this.action();
  }

  hide() {
    this.$n.addClass('hide');
    setTimeout(() => this.$n.remove(), 200);
  }

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
    avatar, title, message, type = '', duration = 3000, action,
  }) {
    if (lastNotification) Notification.hide();
    if (avatar) type += ' avatar';
    if (title) type += ' title';
    const $dom = $(tpl`<div class="notification ${type} hide"></div>`);
    if (avatar) $(tpl`<img width="64" height="64" class="avatar" src="${avatar}"></img>`).appendTo($dom);
    if (title) $(tpl`<h2>${title}</h2>`).appendTo($dom);
    $(tpl`<p>${message}</p>`).appendTo($dom);
    $dom.on('clink', action);
    const $n = $dom
      .css('z-index', zIndexManager.getNext())
      .appendTo('body');
    $n.width(); // force reflow
    $n.removeClass('hide');
    lastNotification = $n;
    autoHideTimer = setTimeout(Notification.hide, duration);
    return $n;
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

window.Hydro.components.Notification = Notification;
