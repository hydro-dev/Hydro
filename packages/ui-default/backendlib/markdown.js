const MarkdownIt = require('markdown-it');
const Prism = require('prismjs');

// For math: $a\times b\eq 10$
// Specific image size: ![image](image.png =100x100)
const Imsize = require('markdown-it-imsize');
/* Footnote support.
Here is a footnote reference,[^1] and another.[^longnote]

[^1]: Here is the footnote.

[^longnote]: Here's one with multiple blocks.

    Subsequent paragraphs are indented to show that they
belong to the previous footnote.
*/
const Footnote = require('markdown-it-footnote');
// ==Highlight==
const Mark = require('markdown-it-mark');
const TOC = require('markdown-it-table-of-contents');
const Anchor = require('markdown-it-anchor');
// @[url](videourl)
// @[youtube](https://youtube.com/watch?v=xxx)
// @[pdf](https://foo.com/bar.pdf)
const Media = require('./markdown-it-media');
const Katex = require('./markdown-it-katex');

require('prismjs/components/index');

class Markdown extends MarkdownIt {
  constructor() {
    super({
      linkify: true,
      highlight(str, lang) {
        if (lang && Prism.languages[lang]) {
          try {
            return Prism.highlight(str, Prism.languages[lang], lang);
          } catch (__) { }
        }
        return '';
      },
    });
    this.linkify.tlds('.py', false);
    this.use(Media);
    this.use(Imsize);
    this.use(Footnote);
    this.use(Mark);
    this.use(Anchor);
    this.use(TOC);
    this.use(Katex);
  }
}

const md = new Markdown();

function plugin(func, ...args) {
  md.use(func, ...args);
}

function render(text, html = false) {
  md.set({ html: !!html });
  return md.render(text);
}

function renderInline(text, html = false) {
  md.set({ html: !!html });
  return md.renderInline(text);
}

// eslint-disable-next-line no-multi-assign
global.Hydro.lib.markdown = module.exports = {
  md, plugin, render, renderInline,
};
