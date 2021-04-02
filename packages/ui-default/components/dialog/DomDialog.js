import _ from 'lodash';
import DOMAttachedObject from 'vj/components/DOMAttachedObject';

import zIndexManager from 'vj/utils/zIndexManager';

export default class DomDialog extends DOMAttachedObject {
  static DOMAttachKey = 'vjDomDialogInstance';

  constructor($dom, options = {}) {
    super($dom);
    this.isShown = false;
    this.isAnimating = false;
    this.options = {
      cancelByClickingBack: false,
      cancelByEsc: false,
      onDispatch: () => {},
      ...options,
    };
    this._defer = null;
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
    $wrap.transition({
      opacity: 1,
    }, {
      duration: 100,
      easing: 'easeOutCubic',
    });

    const $dgContent = this.$dom.find('.dialog__content');
    $dgContent.css({
      scale: 0.8,
    });
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

    this.$dom.css({
      opacity: 1,
    });
    this.$dom.transition({
      opacity: 0,
    }, {
      duration: 200,
    });

    const $dgContent = this.$dom.find('.dialog__content');
    $dgContent.css({
      scale: 1,
    });
    await $dgContent
      .transition({
        scale: 0.8,
      }, {
        duration: 200,
        easing: 'easeOutCubic',
      })
      .promise();

    this.$dom.css('display', 'none');

    this.isShown = false;
    this.isAnimating = false;
    this.$dom.trigger('vjDomDialogHidden');
  }

  show() {
    if (this.isShown || this.isAnimating) {
      return Promise.reject();
    }
    this._defer = new $.Deferred();
    this._show();
    return this._defer.promise();
  }

  hide() {
    if (!this.isShown || this.isAnimating) {
      return false;
    }
    if (this._defer.state() === 'pending') {
      this._defer.resolve('cancel');
    }
    this._defer = null;
    this._hide();
    return true;
  }

  dispatchAction(data) {
    if (this.options.onDispatch(data) === false) {
      return;
    }
    this._defer.resolve(data);
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

_.assign(DomDialog, DOMAttachedObject);
