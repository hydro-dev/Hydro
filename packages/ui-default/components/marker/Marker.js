import _ from 'lodash';
import delay from 'vj/utils/delay';
import Tooltip from 'vj/components/tooltip/Tooltip';
import i18n from 'vj/utils/i18n';

const MARKER_ID = `marker_${Math.floor(Math.random() * 0xFFFFFF).toString(16)}`;
const MARKER_OFFSET = 20;
const MARKER_MAX_DISTANCE = 60;

let markerInstance = null;

function distanceToRect(px, py, rect) {
  const cx = (rect.left + rect.right) / 2;
  const cy = (rect.top + rect.bottom) / 2;
  const dx = Math.max(Math.abs(px - cx) - (rect.right - rect.left) / 2, 0);
  const dy = Math.max(Math.abs(py - cy) - (rect.bottom - rect.top) / 2, 0);
  return Math.sqrt(dx * dx + dy * dy);
}

class Marker {
  static exists() {
    return markerInstance && document.getElementById(MARKER_ID);
  }

  constructor() {
    if (Marker.exists()) {
      return markerInstance;
    }
    if (markerInstance) {
      markerInstance.destroy();
    }
    this.$dom = $(`
      <div class="marker" id="${MARKER_ID}"><div class="marker__toolbar">
        <div class="marker__action" data-color="#ffff00" data-tooltip="${i18n('Mark Yellow')}"><span class="marker__icon icon-yellow"></span></div>
        <div class="marker__action" data-color="#47ff6f" data-tooltip="${i18n('Mark Green')}"><span class="marker__icon icon-green"></span></div>
        <div class="marker__action" data-color="transparent" data-tooltip="${i18n('Clear Marks')}"><span class="icon icon-erase"></span></div>
      </div></div>
    `)
      .appendTo('body');
    this.$dom.find('.marker__toolbar').on('click', '.marker__action', this.onMarkerActionClick.bind(this));
    this.$dom.on('mousedown', this.onMarkerMouseDown.bind(this));
    this.isOpen = false;
    this.bindedHandlers = false;
    this._onKeyDown = this.onKeyDown.bind(this);
    this._onScroll = _.throttle(this.onScroll.bind(this), 50);
    this._onMouseDown = this.onMouseDown.bind(this);
    this._onMouseMove = _.throttle(this.onMouseMove.bind(this), 50);
    markerInstance = this;
  }

  markSelection(color) {
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);
    this.$container.attr('contentEditable', true);
    if (range) {
      // recover ranges
      selection.removeAllRanges();
      selection.addRange(range);
    }
    if (!document.execCommand('HiliteColor', false, color)) {
      document.execCommand('BackColor', false, color);
    }
    this.$container.removeAttr('contentEditable');
    if (range) {
      // remove ranges after marking
      selection.removeAllRanges();
    }
  }

  showAtPosition($container, x, y) {
    this.$container = $container;
    this.$dom.css({
      display: 'block',
      opacity: 0,
    });
    const rect = this.$dom[0].getBoundingClientRect();
    this.$dom.css({
      left: x + MARKER_OFFSET,
      top: y - (rect.bottom - rect.top) - MARKER_OFFSET,
    });
    this.isOpen = true;
    this.$dom.addClass('open');
    this.updateMarkerOpacity(x, y);
    this.bindEventHandlersForClosing();
  }

  async close() {
    if (!this.isOpen) {
      return;
    }
    this.isOpen = false;
    this.closeTooltipsImmediately();
    this.unbindEventHandlers();
    this.$dom
      .css({ opacity: 0 })
      .removeClass('open');
    await delay(200);
    if (!this.isOpen) {
      this.$dom.hide();
    }
  }

  closeTooltipsImmediately() {
    const $elements = this.$dom.find('[data-tooltip]');
    $elements.get().forEach((element) => {
      const $el = $(element);
      const tooltipInstance = Tooltip.get($el);
      if (tooltipInstance) {
        tooltipInstance.detach();
      }
    });
  }

  bindEventHandlersForClosing() {
    if (this.bindedHandlers) {
      return;
    }
    $(document).on('keydown', this._onKeyDown);
    $(window).on('scroll', this._onScroll);
    $(document).on('mousedown', this._onMouseDown);
    $(document).on('mousemove', this._onMouseMove);
    this.bindedHandlers = true;
  }

  unbindEventHandlers() {
    if (!this.bindedHandlers) {
      return;
    }
    $(document).off('keydown', this._onKeyDown);
    $(window).off('scroll', this._onScroll);
    $(document).off('mousedown', this._onMouseDown);
    $(document).off('mousemove', this._onMouseMove);
    this.bindedHandlers = false;
  }

  onMarkerActionClick(ev) {
    const color = $(ev.currentTarget).attr('data-color');
    this.markSelection(color);
    this.close();
  }

  onMarkerMouseDown(ev) {
    ev.stopPropagation();
    ev.preventDefault();
  }

  onKeyDown() {
    this.close();
  }

  onScroll() {
    this.close();
  }

  onMouseMove(ev) {
    this.updateMarkerOpacity(ev.clientX, ev.clientY);
  }

  onMouseDown() {
    this.close();
  }

  updateMarkerOpacity(x, y) {
    const markerRect = this.$dom[0].getBoundingClientRect();
    const distance = distanceToRect(x, y, markerRect);
    if (distance > MARKER_MAX_DISTANCE) {
      this.close();
      return;
    }
    this.$dom.css('opacity', 1 - (distance / MARKER_MAX_DISTANCE));
  }

  destroy() {
    this.close();
    this.$dom.remove();
    markerInstance = null;
  }
}

const MarkerInterface = {
  close() {
    if (!markerInstance) {
      return;
    }
    markerInstance.close();
  },
  showAtPosition($container, x, y) {
    const marker = new Marker();
    marker.showAtPosition($container, x, y);
  },
};

export default MarkerInterface;
