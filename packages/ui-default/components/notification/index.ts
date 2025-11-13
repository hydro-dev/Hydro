import { createTheme, MantineProvider, Notification as MantineNotification } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import $ from 'jquery';
import React from 'react';
import { tpl, zIndexManager } from 'vj/utils/base';

const colorWhite = {
  color: 'var(--mantine-color-white)',
} as const;

const theme = createTheme({
  components: {
    Notification: MantineNotification.extend({
      classNames: {
        closeButton: 'mantine-notifications-close-button',
      },
      styles: {
        root: {
          backgroundColor: 'var(--notification-color, var(--mantine-primary-color-filled))',
          paddingInlineStart: 'var(--mantine-spacing-xs)',
        },
        title: {
          ...colorWhite,
          fontSize: 'var(--mantine-font-size-md)',
        },
        icon: {
          fontSize: '24px',
          marginInlineEnd: 'var(--mantine-spacing-xs)',
        },
        description: colorWhite,
        closeButton: colorWhite,
      },
    }),
  },
});

document.body.append(tpl(
  React.createElement(MantineProvider, { theme },
    React.createElement(Notifications, { position: 'bottom-left', zIndex: 99999 }),
  ), true),
);

interface NotificationOptions {
  avatar?: string;
  title?: string;
  message: string;
  type?: string;
  duration?: number;
  action?: any;
}

export default class Notification {
  type: string;
  action: any;
  $dom: JQuery<HTMLElement>;
  $n: JQuery<HTMLElement>;
  duration: number;
  autoHideTimer?: NodeJS.Timeout;

  constructor({
    avatar, title, message, type = '', duration = 3000, action,
  }: NotificationOptions) {
    this.type = type;
    if (avatar) this.type += ' avatar';
    if (title) this.type += ' title';
    this.action = action || (() => { });
    this.$dom = $(tpl`<div class="notification ${this.type} hide"></div>`);
    if (avatar) $(tpl`<img width="32" height="32" class="avatar" src="${avatar}"></img>`).appendTo(this.$dom);
    const content = message.split('\n').map((line) => tpl`<p>${line}</p>`).join('');
    if (title) {
      $(tpl`<div class="notification-content"><h2>${title}</h2>${{ templateRaw: true, html: content }}</div>`).appendTo(this.$dom);
    } else $(`<div>${content}</div>`).appendTo(this.$dom);
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

  static success(message: string, duration?: number) {
    return notifications.show({
      title: message,
      color: '#238551',
      message: '',
      icon: React.createElement('i', { className: 'icon icon-check' }),
      autoClose: duration,
    });
  }

  static info(message: string, duration?: number) {
    return notifications.show({
      title: message,
      color: '#2d72d2',
      message: '',
      icon: React.createElement('i', { className: 'icon icon-info--circle' }),
      autoClose: duration,
    });
  }

  static warn(message: string, duration?: number) {
    return notifications.show({
      title: message,
      color: '#fbb360',
      message: '',
      icon: React.createElement('i', { className: 'icon icon-warning' }),
      autoClose: duration,
    });
  }

  static error(message: string, duration?: number) {
    return notifications.show({
      title: message,
      color: '#cd4246',
      message: '',
      icon: React.createElement('i', { className: 'icon icon-close--circle' }),
      autoClose: duration,
    });
  }
}
