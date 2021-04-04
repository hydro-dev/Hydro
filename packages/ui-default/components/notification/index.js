import tpl from 'vj/utils/tpl';
import zIndexManager from 'vj/utils/zIndexManager';

export default class Notification {
  constructor({
    avatar, title, message, type = '', duration = 3000, action,
  }) {
    this.type = type;
    if (avatar) this.type += ' avatar';
    if (title) this.type += ' title';
    this.action = action || (() => { });
    this.$dom = $(tpl`<div class="notification ${type} hide"></div>`);
    if (avatar) $(tpl`<img width="64" height="64" class="avatar" src="${avatar}"></img>`).appendTo(this.$dom);
    if (title) {
      $(tpl`<div class="notification-content"><h2>${title}</h2><p>${message}</p></div>`).appendTo(this.$dom);
    } else $(tpl`<p>${message}</p>`).appendTo(this.$dom);
    this.$dom.on('click', this.handleClick.bind(this));
    this.$n = this.$dom
      .css('z-index', zIndexManager.getNext())
      .appendTo(document.body);
    this.$n.width(); // force reflow
    this.duration = duration;
  }

  handleClick() {
    this.action();
  }

  show(autohide = true) {
    this.$n.removeClass('hide');
    if (this.duration && autohide) this.autoHideTimer = setTimeout(this.hide.bind(this), this.duration);
  }

  hide() {
    this.$n.addClass('hide');
    setTimeout(() => this.$n.remove(), 200);
  }

  static success(message, duration) {
    return new Notification({ type: 'success', message, duration }).show();
  }

  static info(message, duration) {
    return new Notification({ type: 'info', message, duration }).show();
  }

  static warn(message, duration) {
    return new Notification({ type: 'warn', message, duration }).show();
  }

  static error(message, duration) {
    return new Notification({ type: 'error', message, duration }).show();
  }
}

window.Hydro.components.Notification = Notification;
