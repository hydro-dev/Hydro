import $ from 'jquery';
import DOMAttachedObject from 'vj/components/DOMAttachedObject';
import { delay } from 'vj/utils';

const ANIMATION_DURATION = 4000;

const POS_ABOVE = -1;
const POS_ORIGINAL = 0;
const POS_BELOW = 1;

const POS_CLASSNAME = {
  [POS_ABOVE]: 'pos--above',
  [POS_ORIGINAL]: '',
  [POS_BELOW]: 'pos--below',
};

export default class Rotator extends DOMAttachedObject {
  static DOMAttachKey = 'vjRotatorInstance';

  getItemClass(pos) {
    return `rotator__item ${POS_CLASSNAME[pos]}`;
  }

  constructor($dom) {
    super($dom);
    $dom.addClass('rotator');
    this.value = $dom.text();
    this.$item = this
      .createItem(this.value, POS_ORIGINAL)
      .appendTo($dom.empty());
  }

  createItem(value, initialPosition) {
    const $el = $('<div>')
      .text(value)
      .attr('class', this.getItemClass(initialPosition));
    return $el;
  }

  async animateOutItem(toPosition) {
    const { $item } = this;
    $item.attr('class', this.getItemClass(toPosition));
    await delay(ANIMATION_DURATION);
    $item.remove();
  }

  async animateInItem() {
    const { $item } = this;
    $item.height(); // force reflow
    $item.attr('class', this.getItemClass(POS_ORIGINAL));
    await delay(ANIMATION_DURATION);
  }

  setValue(value) {
    if (value === this.value) {
      return;
    }
    let fromPosition;
    if (Number.parseFloat(value) > Number.parseFloat(this.value)) {
      fromPosition = POS_BELOW;
    } else {
      fromPosition = POS_ABOVE;
    }
    this.animateOutItem(-fromPosition);
    this.value = value;
    this.$item = this
      .createItem(value, fromPosition)
      .appendTo(this.$dom);
    this.animateInItem();
  }

  getValue() {
    return this.value;
  }
}
