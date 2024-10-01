import $ from 'jquery';
import DOMAttachedObject from 'vj/components/DOMAttachedObject';
import { zIndexManager } from 'vj/utils';

export interface DialogOptions {
  classes: string;
  $body: HTMLElement | JQuery<HTMLElement> | string;
  $action: any;
  width?: string;
  height?: string;
  cancelByClickingBack?: boolean;
  cancelByEsc?: boolean;
  canCancel?: boolean;
  onDispatch?: (data: any) => any;
}

export default class DomDialog extends DOMAttachedObject {
  static DOMAttachKey = 'vjDomDialogInstance';
  isShown = false;
  isAnimating = false;
  options: DialogOptions;
  _resolve: (value: string | PromiseLike<string>) => void;

  constructor($dom, options: Partial<DialogOptions> = {}) {
    super($dom);
    this.options = {
      cancelByClickingBack: false,
      cancelByEsc: false,
      onDispatch: () => { },
      ...options as any,
    };
  }

  async _show() {
    this.$dom.css('z-index', zIndexManager.getNext());
    this.$dom.trigger('vjDomDialogShow');
    this.isAnimating = true;

    if (this.options.cancelByClickingBack) {
      this.$dom.on(`click.${this.eventNS}`, this.handleClick.bind(this));
    }
    if (this.options.cancelByEsc) {
      $(document).on(`keyup.${this.eventNS}`, this.handleKeyUp.bind(this));
    }

    const $wrap = this.$dom;
    $wrap.css({
      display: 'flex',
      opacity: 0,
    });
    $wrap.width();
    $wrap.transition(
      { opacity: 1 },
      {
        duration: 100,
        easing: 'easeOutCubic',
      },
    );

    const $dgContent = this.$dom.find('.dialog__content');
    $dgContent.css({ scale: 0.8 });
    $dgContent.trigger('vjContentNew');
    await $dgContent
      .transition({
        scale: 1,
      }, {
        duration: 200,
        easing: 'easeOutCubic',
      })
      .promise();

    this.$dom.find('[data-autofocus]').focus();

    this.isShown = true;
    this.isAnimating = false;
    this.$dom.trigger('vjDomDialogShown');
  }

  async _hide() {
    this.$dom.trigger('vjDomDialogHide');
    this.isAnimating = true;

    $(document).off(`keyup.${this.eventNS}`);
    this.$dom.off(`click.${this.eventNS}`);

    this.$dom.css({ opacity: 1 });
    this.$dom.transition({
      opacity: 0,
    }, {
      duration: 200,
    });

    const $dgContent = this.$dom.find('.dialog__content');
    $dgContent.css({ scale: 1 });
    await $dgContent
      .transition(
        { scale: 0.8 },
        {
          duration: 200,
          easing: 'easeOutCubic',
        },
      ).promise();

    this.$dom.css('display', 'none');

    this.isShown = false;
    this.isAnimating = false;
    this.$dom.trigger('vjDomDialogHidden');
  }

  show() {
    if (this.isShown) return Promise.reject(new Error('dialog isShown'));
    if (this.isAnimating) return Promise.reject(new Error('dialog isAnimating'));
    const promise = new Promise<string>((resolve) => {
      this._resolve = resolve;
    });
    this._show();
    return promise;
  }

  hide() {
    if (!this.isShown || this.isAnimating) return false;
    this._resolve('cancel');
    this._hide();
    return true;
  }

  dispatchAction(data: string) {
    if (this.options.onDispatch(data) === false) return;
    this._resolve(data);
    this.hide();
  }

  handleClick(e) {
    if (e.target === this.$dom.get(0)) {
      this.dispatchAction('cancel');
    }
  }

  handleKeyUp(e) {
    if (e.keyCode === 27) {
      this.dispatchAction('cancel');
    }
  }
}
