import $ from 'jquery';
import responsiveCutoff from 'vj/breakpoints.json';
import DOMAttachedObject from 'vj/components/DOMAttachedObject';
import { isBelow } from 'vj/utils/mediaQuery';

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

    // Sentinel to detect when header becomes stuck
    this.$sentinel = $('<div>').css({ height: 0, margin: 0, padding: 0 });

    // Header sits outside the scroll container so sticky works against viewport
    this.$header = $('<table>');
    this.$header.attr('class', `${this.$dom.attr('class')} section__table-header`);
    this.$header.css({
      position: 'sticky',
      top: `${navHeight}px`,
    });

    // Scroll container only wraps the data table
    this.$container = $('<div>').addClass('section__table-container');
    this.$sentinel.insertBefore(this.$dom);
    this.$header.insertBefore(this.$dom);
    this.$container.insertBefore(this.$dom);
    this.$container.append(this.$dom);

    this.$header.empty();
    this.$dom.children('colgroup').clone().appendTo(this.$header);
    this.$dom.children('thead').appendTo(this.$header);

    // Sync horizontal scroll between header and body
    this.$container.on('scroll', () => {
      this.$header.css('transform', `translateX(-${this.$container.scrollLeft()}px)`);
    });

    // Detect sticky state via IntersectionObserver
    const header = this.$header[0];
    const sentinel = this.$sentinel[0];
    if (window.IntersectionObserver) {
      this._observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            header.classList.remove('is_stuck');
          } else {
            header.classList.add('is_stuck');
          }
        },
        { threshold: [0], rootMargin: `-${navHeight}px 0px 0px 0px` },
      );
      this._observer.observe(sentinel);
    }
  }

  detach() {
    if (this._observer) this._observer.disconnect();
    super.detach();
  }
}
