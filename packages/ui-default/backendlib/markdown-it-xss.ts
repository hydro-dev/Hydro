import * as Xss from 'xss';

const stack = [];
let isFull = false;

const xss = new Xss.FilterXSS({
  whiteList: {
    a: ['target', 'href', 'title'],
    abbr: ['title'],
    address: [],
    area: ['shape', 'coords', 'href', 'alt'],
    article: [],
    aside: [],
    audio: ['autoplay', 'controls', 'loop', 'preload', 'src'],
    b: [],
    bdi: ['dir'],
    bdo: ['dir'],
    big: [],
    blockquote: ['cite', 'class'],
    br: [],
    caption: [],
    center: [],
    cite: [],
    code: ['class'],
    col: ['align', 'valign', 'span', 'width'],
    colgroup: ['align', 'valign', 'span', 'width'],
    dd: [],
    del: ['datetime'],
    details: ['open'],
    div: ['id', 'class'],
    dl: [],
    dt: [],
    em: [],
    font: ['color', 'size', 'face'],
    h1: ['id'],
    h2: ['id', 'class'],
    h3: ['id'],
    h4: ['id'],
    h5: ['id'],
    h6: ['id'],
    header: [],
    hr: [],
    i: [],
    img: ['src', 'alt', 'title', 'width', 'height'],
    ins: ['datetime'],
    li: [],
    mark: [],
    ol: [],
    p: [],
    pre: [],
    s: [],
    section: [],
    small: [],
    span: ['class'],
    sub: [],
    summary: [],
    sup: [],
    strong: ['id'],
    table: ['width', 'border', 'align', 'valign'],
    tbody: ['align', 'valign'],
    td: ['width', 'rowspan', 'colspan', 'align', 'valign', 'bgcolor'],
    tfoot: ['align', 'valign'],
    th: ['width', 'rowspan', 'colspan', 'align', 'valign'],
    thead: ['align', 'valign'],
    tr: ['rowspan', 'align', 'valign'],
    tt: [],
    u: [],
    ul: [],
    var: [],
    video: ['autoplay', 'controls', 'loop', 'preload', 'src', 'height', 'width'],
  },
  allowCommentTag: false,
  stripIgnoreTagBody: ['script'],
  safeAttrValue(tag, name, value) {
    if (name === 'id') return `xss-id-${value}`;
    if (name === 'class') return value.replace(/badge/g, 'xss-badge');
    return value;
  },
  onTag(tag, html, options) {
    if (!options.isWhite || !isFull) return null;
    if (!options.isClosing) {
      stack.push(tag);
      return null;
    }
    if (stack.length === 0) return `&lt;/${tag}&gt;`; // 没有标签可供闭合
    if (stack[stack.length - 1] === tag) {
      stack.pop(); // 正常关闭
      return null;
    }
    if (stack.length - 2 >= 0 && stack[stack.length - 2] === tag) {
      // 可能丢失了一个结束标签
      stack.pop();
      stack.pop();
      return null;
    }
    return `&lt;/${tag}&gt;`; // 可能多出了一个结束标签
  },
});

xss.process = ((original) => (html: string, full: boolean = false) => {
  stack.length = 0;
  isFull = full;
  const res = original(html);
  if (!full) return res;
  return res + stack.map((i) => `</${i}>`).join('');
})(xss.process.bind(xss));

function xssProtector(md) {
  function protector(state) {
    for (let i = 0; i < state.tokens.length; i++) {
      const cur = state.tokens[i];
      if (cur.type === 'html_block') {
        cur.content = xss.process(cur.content);
      }
      if (cur.type === 'inline') {
        const inlineTokens = cur.children;
        for (let ii = 0; ii < inlineTokens.length; ii++) {
          if (inlineTokens[ii].type === 'html_inline') {
            inlineTokens[ii].content = xss.process(inlineTokens[ii].content);
          }
        }
      }
    }
  }

  md.core.ruler.after('linkify', 'xss', protector);
}

module.exports = { xss, xssProtector };
