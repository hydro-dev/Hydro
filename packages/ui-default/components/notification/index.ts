import {
  Position, Toaster, Intent, ToasterPosition,
} from '@blueprintjs/core';
import tpl from 'vj/utils/tpl';
import zIndexManager from 'vj/utils/zIndexManager';

const ToasterContainer = document.createElement('div');
ToasterContainer.style.position = 'fixed';
ToasterContainer.style.bottom = '0px';
ToasterContainer.style.zIndex = '9999';
document.body.append(ToasterContainer);

export const AppToaster = Toaster.create({
  className: 'recipe-toaster',
  position: Position.LEFT_BOTTOM as ToasterPosition,
  usePortal: true,
}, ToasterContainer);

export default class Notification {
  type: string;
  action: any;
  $dom: JQuery<HTMLElement>;
  $n: JQuery<HTMLElement>;
  duration: number;
  autoHideTimer: any;
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
    if (document.hidden && window.Notification?.permission === 'granted') {
      // eslint-disable-next-line no-new
      new window.Notification(title || 'Hydro Notification',
        {
          icon: avatar || '/android-chrome-192x192.png',
          body: message,
        });
    }
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
    return AppToaster.show({ message, timeout: duration, intent: Intent.SUCCESS });
  }

  static info(message, duration) {
    return AppToaster.show({ message, timeout: duration, intent: Intent.PRIMARY });
  }

  static warn(message, duration) {
    return AppToaster.show({ message, timeout: duration, intent: Intent.WARNING });
  }

  static error(message, duration) {
    return AppToaster.show({ message, timeout: duration, intent: Intent.DANGER });
  }
}

window.Hydro.components.Notification = Notification;
