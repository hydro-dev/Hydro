import tpl from 'vj/utils/tpl';
import i18n from 'vj/utils/i18n';
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
    let box = '';
    if (options.width) box += `width:${options.width};max-width:${options.width};`;
    if (options.height) box += `height:${options.height};max-height:${options.height};`;
    this.$dom = $(tpl`
      <div class="dialog withBg ${this.options.classes}" style="display:none">
        <div class="dialog__content" style="${box}">
          <div class="dialog__body" style="height:calc(100% - 45px);"></div>
          <div class="row"><div class="columns clearfix">
            <div class="float-right dialog__action"></div>
          </div></div>
        </div>
      </div>
    `);
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
