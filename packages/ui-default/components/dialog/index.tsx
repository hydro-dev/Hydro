import $ from 'jquery';
import React from 'react';
import { i18n, tpl } from 'vj/utils';
import DomDialog, { DialogOptions } from './DomDialog';

export class Dialog {
  options: DialogOptions;
  $dom: JQuery<any>;
  domDialogInstance: DomDialog;

  constructor(options: Partial<DialogOptions> = {}) {
    this.options = {
      classes: '',
      $body: null,
      $action: null,
      ...options,
    };
    const box: React.CSSProperties = {};
    if (options.width) box.width = box.maxWidth = options.width;
    if (options.height) box.height = box.maxHeight = options.height;
    this.$dom = $(tpl(
      <div className={`dialog withBg ${this.options.classes}`} style={{ display: 'none' }}>
        <div className="dialog__content" style={box}>
          <div className="dialog__body" style={{ height: 'calc(100% - 45px)' }} />
          <div className="row"><div className="columns clearfix">
            <div className="float-right dialog__action" />
          </div></div>
        </div>
      </div>,
    ));
    this.$dom.on('click', '[data-action]', this.handleActionButton.bind(this));
    this.$dom.on('vjDomDialogShow', this.beforeShow.bind(this));
    this.$dom.on('vjDomDialogHidden', this.afterHide.bind(this));
    this.$dom.find('.dialog__body').append(this.options.$body);
    this.$dom.find('.dialog__action').append(this.options.$action);
    this.domDialogInstance = new DomDialog(this.$dom, this.options);
  }

  beforeShow() {
    this.$dom.appendTo('body');
  }

  afterHide() {
    this.$dom.detach();
  }

  open() {
    return this.domDialogInstance.show();
  }

  close() {
    return this.domDialogInstance.hide();
  }

  handleActionButton(ev) {
    this.domDialogInstance.dispatchAction($(ev.currentTarget).attr('data-action'));
  }
}

export default Dialog;

const buttonOk = tpl`<button class="primary rounded button" data-action="ok">${i18n('Ok')}</button>`;
const buttonCancel = tpl`<button class="rounded button" data-action="cancel">${i18n('Cancel')}</button>`;
const buttonYes = tpl`<button class="primary rounded button" data-action="yes">${i18n('Yes')}</button>`;
const buttonNo = tpl`<button class="rounded button" data-action="no">${i18n('No')}</button>`;

export class InfoDialog extends Dialog {
  constructor(options: Partial<DialogOptions> = {}) {
    super({
      $action: buttonOk,
      cancelByClickingBack: true,
      cancelByEsc: true,
      ...options,
    });
  }
}

export class ActionDialog extends Dialog {
  constructor(options: Partial<DialogOptions> = {}) {
    super({
      $action: [buttonCancel, buttonOk].join('\n'),
      cancelByClickingBack: true,
      cancelByEsc: true,
      ...options,
    });
  }

  clear() {
    this.$dom.find('input').val('');
    return this;
  }
}

export class ConfirmDialog extends Dialog {
  constructor(options: Partial<DialogOptions> = {}) {
    let buttons = [];
    if (options.canCancel) {
      buttons = [buttonCancel, buttonNo, buttonYes];
    } else {
      buttons = [buttonNo, buttonYes];
    }
    super({
      $action: buttons.join('\n'),
      cancelByClickingBack: options.canCancel,
      cancelByEsc: options.canCancel,
      ...options,
    });
  }
}

window.Hydro.components.Dialog = Dialog;
window.Hydro.components.InfoDialog = InfoDialog;
window.Hydro.components.ActionDialog = ActionDialog;
window.Hydro.components.ConfirmDialog = ConfirmDialog;
