import _ from 'lodash';
import DOMAttachedObject from 'vj/components/DOMAttachedObject';
import request from 'vj/utils/request';
import TextareaHandler from 'vj/components/cmeditor/textareaHandler';
import Notification from 'vj/components/notification';

let initialized = false;
const $template = $('.dczcomments__box').eq(0).clone();

function getClosestInstance($dom) {
  return $dom.closest('.dczcomments__box').data('instance');
}

function onBoxCancel(ev) {
  const commentBox = getClosestInstance($(ev.currentTarget));
  if (commentBox) {
    commentBox.onCancel(ev);
  }
}

function onBoxSubmit(ev) {
  const commentBox = getClosestInstance($(ev.currentTarget));
  if (commentBox) {
    commentBox.onSubmit(ev);
  }
  ev.preventDefault();
}

function init() {
  if (initialized) {
    return;
  }
  $(document).on('submit', '[name="dczcomments__box__form"]', onBoxSubmit);
  $(document).on('vjCommentBoxCancel', '[name="dczcomments__box__form"]', onBoxCancel);
  $(document).on('click', '[name="dczcomments__box__cancel"]', onBoxCancel);
  initialized = true;
}

export default class CommentBox extends DOMAttachedObject {
  static DOMAttachKey = 'vjCommentBoxInstance';

  constructor($dom, options = {}) {
    super($dom);
    init(); // delay initialize
    this.$box = $template.clone();
    this.$box.data('instance', this);
    this.options = {
      initialText: null,
      mode: null,
      form: null,
      onCancel: () => null,
      ...options,
    };
    if (this.options.initialText) {
      this.setText(this.options.initialText);
    }
    if (this.options.mode) {
      const submitButton = this.$box.find('.dczcomments__box__submit');
      submitButton.val(submitButton.attr(`data-value-${this.options.mode}`));
    }
  }

  getTextareaHandler() {
    const $textarea = this.$box.find('textarea');
    return TextareaHandler.getOrConstruct($textarea);
  }

  focus() {
    this.getTextareaHandler().focus();
    return this;
  }

  setText(text) {
    this.getTextareaHandler().val(text);
    return this;
  }

  getText() {
    return this.getTextareaHandler().val();
  }

  insertText(text) {
    const handler = this.getTextareaHandler();
    handler.val(handler.val() + text);
    return this;
  }

  appendTo($dom) {
    this.$box.appendTo($dom);
    this.$box.trigger('vjContentNew');
    return this;
  }

  async onSubmit() {
    try {
      await request.post('', {
        ...this.options.form,
        content: this.getText(),
      });
      window.location.reload();
    } catch (error) {
      Notification.error(error.message);
    }
  }

  async onCancel(ev) {
    await this.options.onCancel(ev);
    this.$box.remove();
    this.detach();
  }
}

_.assign(CommentBox, DOMAttachedObject);
