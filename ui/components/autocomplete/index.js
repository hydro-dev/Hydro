import Drop from 'tether-drop';
import _ from 'lodash';
import 'jquery-scroll-lock';

import DOMAttachedObject from 'vj/components/DOMAttachedObject';

import i18n from 'vj/utils/i18n';
import tpl from 'vj/utils/tpl';
import zIndexManager from 'vj/utils/zIndexManager';

export default class AutoComplete extends DOMAttachedObject {
  static DOMAttachKey = 'vjAutoCompleteInstance';

  constructor($dom, options = {}) {
    super($dom);
    this.options = {
      items: async () => [],
      render: () => '',
      text: () => null,
      minChar: 1,
      cache: true,
      clearDefaultValue: true,
      position: 'bottom left',
      classes: '',
      ...options,
    };
    this.clear(this.options.clearDefaultValue);
    this.menuShown = false;
    this.cache = {};
    this.currentItems = [];
    this.$menu = $(`<ol class="menu ${this.options.classes}"></ol>`);
    this.$menu.scrollLock({ strict: false });
    this.$menu.on('mousedown', this.onMenuClick.bind(this));
    this.$menu.on('mousedown', '.menu__item', this.onItemClick.bind(this));
    this.dropInstance = new Drop({
      classes: 'autocomplete dropdown',
      target: this.$dom[0],
      content: this.$menu[0],
      position: this.options.position,
      constrainToWindow: false,
      constrainToScrollParent: false,
      openOn: false,
    });
    this.dropInstance.on('open', this.onDropOpen.bind(this));
    this.attach();
  }

  clear(clearValue = true) {
    if (clearValue) {
      this.$dom.val('');
    }
    this._value = null;
    this.lastText = null;
  }

  attach() {
    this.$dom.on(`click.${this.eventNS}`, this.onClick.bind(this));
    this.$dom.on(`focus.${this.eventNS}`, this.onFocus.bind(this));
    this.$dom.on(`blur.${this.eventNS}`, this.onBlur.bind(this));
    this.$dom.on(`keydown.${this.eventNS}`, this.onKeyDown.bind(this));
    this.$dom.on(`keyup.${this.eventNS}`, this.onKeyUp.bind(this));
  }

  onClick() {
    this.updateOpenState();
  }

  onFocus() {
    this.isFocus = true;
    this.updateOpenState();
  }

  onBlur() {
    this.isFocus = false;
    this.updateOpenState();
  }

  onKeyDown() {
    // TODO: Implement keyboard navigation
  }

  onKeyUp(ev) {
    if (ev.which === 27) {
      // ESC
      this.close();
      return;
    }
    if (this.$dom.val() === this.lastText) {
      return;
    }
    this.lastText = this.$dom.val();
    this.updateOpenState();
    if (this.isOpen) {
      this.renderList();
    }
  }

  onMenuClick(ev) {
    ev.preventDefault(); // prevent from losing focus
  }

  onItemClick(ev) {
    const idx = $(ev.currentTarget).attr('data-idx');
    if (idx === undefined) {
      return;
    }
    const item = this.currentItems[idx];
    const text = this.options.text(item);
    this._value = item;
    this.$dom.trigger('vjAutoCompleteSelect', item);
    if (text != null) {
      this.$dom.val(text);
    }
    this.close();
  }

  onDropOpen() {
    $(this.dropInstance.drop).css('z-index', zIndexManager.getNext());
  }

  async getItems(val) {
    if (this.cache[val] !== undefined) {
      return this.cache[val];
    }
    const data = await this.options.items(val);
    if (this.options.cache) {
      this.cache[val] = data;
    }
    return data;
  }

  getHtml(items) {
    if (items.length === 0) {
      return tpl`<div class="empty-row">${i18n('Oops, there are no results.')}</div>`;
    }
    return items.map((item, idx) => `
      <li class="menu__item" data-idx="${idx}"><a href="javascript:;" class="menu__link">
        ${this.options.render(item)}
      </a></li>
    `).join('\n');
  }

  async renderList() {
    const val = this.$dom.val();
    const items = await this.getItems(val);
    const html = this.getHtml(items);
    this.currentItems = items;
    this.$menu.html(html);
  }

  open() {
    if (this.isOpen) {
      return;
    }
    this.dropInstance.open();
    this.isOpen = true;
  }

  close() {
    if (!this.isOpen) {
      return;
    }
    this.dropInstance.close();
    this.isOpen = false;
  }

  updateOpenState() {
    if (this.isFocus && this.$dom.val().length >= this.options.minChar) {
      if (!this.isOpen) {
        this.open();
        this.renderList();
      }
    } else {
      if (this.isOpen) {
        this.close();
      }
    }
  }

  detach() {
    if (this.detached) {
      return;
    }
    super.detach();
    this.$dom.off(`focus.${this.eventNS}`);
    this.$dom.off(`blur.${this.eventNS}`);
    this.$dom.off(`keydown.${this.eventNS}`);
    this.$dom.off(`keyup.${this.eventNS}`);
    this.dropInstance.destroy();
    this.$menu.remove();
  }

  value() {
    return this._value;
  }

  focus() {
    this.$dom.focus();
  }
}

_.assign(AutoComplete, DOMAttachedObject);
