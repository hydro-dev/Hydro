import 'sticky-kit/dist/sticky-kit';
import _ from 'lodash';
import DOMAttachedObject from 'vj/components/DOMAttachedObject';
import { isBelow } from 'vj/utils/mediaQuery';
import responsiveCutoff from 'vj/breakpoints.json';

const navHeight = isBelow(responsiveCutoff.mobile)
  ? 0
  : $('.nav').height();

export default class StyledTable extends DOMAttachedObject {
  static DOMAttachKey = 'vjStyledTableInstance';

  static DOMAttachSelector = '.data-table';

  constructor($dom) {
    if ($dom.closest('.section__body').length === 0) {
      super(null);
      return;
    }

    super($dom);

    this.$container = $('<div>').addClass('section__table-container');
    this.$container.insertBefore(this.$dom);

    this.$header = $('<table>');
    this.$header.attr('class', `${this.$dom.attr('class')} section__table-header`);

    this.$container
      .append(this.$header)
      .append(this.$dom);

    this.$header.empty();
    this.$dom.children('colgroup').clone().appendTo(this.$header);
    this.$dom.children('thead').appendTo(this.$header);

    const stickyOptions = {
      parent: this.$container,
      offset_top: navHeight,
    };
    _.defer(() => this.$header.stick_in_parent(stickyOptions));
  }

  detach() {
    super.detach();
    this.$header.trigger('sticky_kit:detach');
  }
}

_.assign(StyledTable, DOMAttachedObject);
