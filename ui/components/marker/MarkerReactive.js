import _ from 'lodash';

import delay from 'vj/utils/delay';
import DOMAttachedObject from 'vj/components/DOMAttachedObject';
import Marker from './Marker';

export default class MarkerReactive extends DOMAttachedObject {
  static DOMAttachKey = 'vjMarkerReactiveInstance';

  static initFromDOM($dom) {
    return MarkerReactive.getOrConstruct($dom);
  }

  static initAll() {
    $('[data-marker-enabled]').get().forEach(dom => MarkerReactive.initFromDOM($(dom)));
  }

  constructor($target) {
    super($target);
    this._onMouseUp = this.onMouseUp.bind(this);
    this.bindEventHandlers();
  }

  bindEventHandlers() {
    this.$dom.on('mouseup', this._onMouseUp);
  }

  unbindEventHandlers() {
    this.$dom.off('mouseup', this._onMouseUp);
  }

  async onMouseUp(ev) {
    await delay(1);
    if (!window.getSelection) {
      return;
    }
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return;
    }
    const range = selection.getRangeAt(0);
    if (range.collapsed) {
      return;
    }
    Marker.showAtPosition(this.$dom, ev.clientX, ev.clientY);
  }

  detach() {
    if (this.detached) {
      return;
    }
    this.unbindEventHandlers();
    Marker.close();
    super.detach();
  }
}

_.assign(MarkerReactive, DOMAttachedObject);
