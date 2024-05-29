import Drop from 'tether-drop';
import responsiveCutoff from 'vj/breakpoints.json';
import DOMAttachedObject from 'vj/components/DOMAttachedObject';
import { mediaQuery, zIndexManager } from 'vj/utils';

export default class Dropdown extends DOMAttachedObject {
  static DOMAttachKey = 'vjDropdownInstance';

  static DOMAttachSelector = '[data-dropdown-target]';

  constructor($dom, options = {}) {
    if ($dom.attr('data-dropdown-trigger-desktop-only') !== undefined) {
      if (mediaQuery.isBelow(responsiveCutoff.mobile)) {
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
      classes: `dropdown ${$dom.attr('data-dropdown-custom-class') || ''}`,
      content: this.options.target || $.find($dom.attr('data-dropdown-target'))[0],
      position: this.options.position,
      openOn: 'hover',
      constrainToWindow: $dom.attr('data-dropdown-disabledconstrainToWindow') === undefined,
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
