import Drop from 'tether-drop';
import _ from 'lodash';
import DOMAttachedObject from 'vj/components/DOMAttachedObject';
import responsiveCutoff from 'vj/breakpoints.json';

import zIndexManager from 'vj/utils/zIndexManager';
import { isBelow } from 'vj/utils/mediaQuery';

export default class Dropdown extends DOMAttachedObject {
  static DOMAttachKey = 'vjDropdownInstance';

  static DOMAttachSelector = '[data-dropdown-target]';

  constructor($dom, options = {}) {
    if ($dom.attr('data-dropdown-trigger-desktop-only') !== undefined) {
      if (isBelow(responsiveCutoff.mobile)) {
        super(null);
        return;
      }
    }
    super($dom);
    this.options = {
      target: null,
      position: $dom.attr('data-dropdown-pos') || 'bottom left',
      ...options,
    };
    this.dropInstance = new Drop({
      target: $dom[0],
      classes: 'dropdown',
      content: this.options.target || $.find($dom.attr('data-dropdown-target'))[0],
      position: this.options.position,
      openOn: 'hover',
      constrainToWindow: true,
      constrainToScrollParent: false,
    });
    this.dropInstance.on('open', this.onDropOpen.bind(this));
    this.dropInstance.on('close', this.onDropClose.bind(this));
  }

  detach() {
    super.detach();
    this.dropInstance.destroy();
  }

  onDropOpen() {
    $(this.dropInstance.drop).css('z-index', zIndexManager.getNext());
    this.$dom.trigger('vjDropdownShow');
  }

  onDropClose() {
    this.$dom.trigger('vjDropdownHide');
  }
}

_.assign(Dropdown, DOMAttachedObject);
