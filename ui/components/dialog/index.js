import tpl from 'vj/utils/tpl';
import i18n from 'vj/utils/i18n';
import DomDialog from './DomDialog';

export default class Dialog {
  constructor(options = {}) {
    this.options = {
      classes: '',
      $body: null,
      $action: null,
      ...options,
    };
    this.$dom = $(tpl`
      <div class="dialog withBg ${this.options.classes}" style="display:none">
        <div class="dialog__content">
          <div class="dialog__body"></div>
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

const buttonOk = tpl`<button class="primary rounded button" data-action="ok">${i18n('Ok')}</button>`;
const buttonCancel = tpl`<button class="rounded button" data-action="cancel">${i18n('Cancel')}</button>`;
const buttonYes = tpl`<button class="primary rounded button" data-action="yes">${i18n('Yes')}</button>`;
const buttonNo = tpl`<button class="rounded button" data-action="no">${i18n('No')}</button>`;

export class InfoDialog extends Dialog {
  constructor(options = {}) {
    super({
      $action: buttonOk,
      cancelByClickingBack: true,
      cancelByEsc: true,
      ...options,
    });
  }
}

export class ActionDialog extends Dialog {
  constructor(options = {}) {
    super({
      $action: [buttonCancel, buttonOk].join('\n'),
      cancelByClickingBack: true,
      cancelByEsc: true,
      ...options,
    });
  }
}

export class ConfirmDialog extends Dialog {
  constructor(options = {}) {
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
