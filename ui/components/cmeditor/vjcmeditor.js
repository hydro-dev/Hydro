import _ from 'lodash';
import SimpleMDE from 'vj-simplemde';

import 'codemirror/mode/clike/clike';
import 'codemirror/mode/pascal/pascal';
import 'codemirror/mode/python/python';
import 'codemirror/mode/php/php';
import 'codemirror/mode/rust/rust';
import 'codemirror/mode/haskell/haskell';
import 'codemirror/mode/javascript/javascript';
import 'codemirror/mode/go/go';
import 'codemirror/mode/ruby/ruby';

import request from 'vj/utils/request';
import i18n from 'vj/utils/i18n';

export default class VjCmEditor extends SimpleMDE {
  constructor(options = {}) {
    super({
      autoDownloadFontAwesome: false,
      spellChecker: false,
      forceSync: true,
      toolbar: [
        {
          name: 'bold',
          action: SimpleMDE.toggleBold,
          className: 'icon icon-bold',
          title: i18n('Bold'),
        },
        {
          name: 'italic',
          action: SimpleMDE.toggleItalic,
          className: 'icon icon-italic',
          title: i18n('Italic'),
        },
        '|',
        {
          name: 'quote',
          action: SimpleMDE.toggleBlockquote,
          className: 'icon icon-quote',
          title: i18n('Quote'),
        },
        {
          name: 'unordered-list',
          action: SimpleMDE.toggleUnorderedList,
          className: 'icon icon-unordered_list',
          title: i18n('Unordered List'),
        },
        {
          name: 'ordered-list',
          action: SimpleMDE.toggleOrderedList,
          className: 'icon icon-ordered_list',
          title: i18n('Ordered List'),
        },
        '|',
        {
          name: 'code',
          action: () => this.insertCodeBlock(),
          className: 'icon icon-code',
          title: i18n('Insert Code'),
          default: true,
        },
        {
          name: 'link',
          action: SimpleMDE.drawLink,
          className: 'icon icon-link',
          title: i18n('Create Link'),
          default: true,
        },
        {
          name: 'image',
          action: SimpleMDE.drawImage,
          className: 'icon icon-insert--image',
          title: i18n('Insert Image'),
          default: true,
        },
        '|',
        {
          name: 'preview',
          action: SimpleMDE.togglePreview,
          preAction: SimpleMDE.preRenderPreview,
          className: 'icon icon-preview no-disable',
          title: i18n('Toggle Preview'),
          default: true,
        },
      ],
      commonmark: {
        safe: true,
      },
      ...options,
    });
  }

  async markdown(text) {
    const data = await request.ajax({
      url: '/preview',
      method: 'post',
      data: $.param({ text }, true),
      dataType: 'text',
    });
    _.defer(this.preparePreview.bind(this));
    return data;
  }

  preparePreview() {
    const $preview = $(this.wrapper).find('.simplemde-preview');
    $preview.addClass('typo');
    $preview.attr('data-emoji-enabled', 'true');
    $preview.trigger('vjContentNew');
  }

  insertCodeBlock() {
    const text = this.codemirror.getSelection();
    const startPoint = this.codemirror.getCursor('start');
    const endPoint = this.codemirror.getCursor('end');
    const leadingLines = (startPoint.line === 0 && startPoint.ch === 0) ? 0 : 2;
    // eslint-disable-next-line prefer-template
    const startText = _.repeat('\n', leadingLines) + '```cpp\n';
    const endText = '\n```\n';
    this.codemirror.replaceSelection(`${startText}${text}${endText}`);
    startPoint.line += leadingLines + 1;
    startPoint.ch = 0;
    if (startPoint !== endPoint) {
      endPoint.line += leadingLines + 1;
    }
    this.codemirror.setSelection(startPoint, endPoint);
    this.codemirror.focus();
  }
}
